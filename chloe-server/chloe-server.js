/*   Copyright (C) 2013-2014 Computer Sciences Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

/*jshint esnext:true*/
// Note, the above jshint options allow for linting, with the "const" keyword.
// To install jshint, use "npm install -g jshint", then run "jshint chloe-server.js"
const webSocketServer = require('ws').Server;
const wss = new webSocketServer({
    host: process.env.OPENSHIFT_NODEJS_IP || 'localhost',
    port: process.env.OPENSHIFT_NODEJS_PORT || 8001
});

// ezbake security client stuff
var EzSecurity = require("ezbakesecurityclient");
var EzConfiguration = require('ezConfiguration');
var ezConfig = new EzConfiguration.EzConfiguration();

// Since the "userInfo.dn" object isn't available anymore, we'll create
// a user specific string by performing MD5 on "userInfo.principal"
var crypto = require("crypto");

// encryption/decryption
var ursa = require('ursa');
var fs = require('fs');
var path = require('path');
var cons = require('ezbakesecurityclient').Constant;
var sslDir = ezConfig.getString(cons.SSL_DIR_KEY);
var publicKey = ursa.coercePublicKey(fs.readFileSync(path.join(sslDir, cons.PUBLIC_KEY_FILE), "utf8"));
var privateKey = ursa.coercePrivateKey(fs.readFileSync(path.join(sslDir, cons.PRIVATE_KEY_FILE), "utf8"));
var Cryptography = require('./lib/Cryptography');

var ezbakeSecurityClient = new EzSecurity.Client(ezConfig);

// redis stuff
const redis = require('redis');
var redisClient;
try {
    console.log((new Date()) + " Connecting to Redis...");
    redisClient = redis.createClient(ezConfig.properties["redis.port"], ezConfig.properties["redis.host"]);
}
catch (err) {
    console.error((new Date()) + " Error occurred creating Redis client: \n\t" + err +
            "\n" + (new Date()) + " Re-throwing error.");
    throw err;
}

// debug flag to clear the redis keys
var clearRedisKeys = false;
process.argv.forEach(function(val, index, array) {
    if (val === '-c') {
        clearRedisKeys = true;
    }
});

// channels is a hash of websocket ids (keys) and redis channel names (values)
var channels = {};
var RedisSubscriptionSupervisor = require('./lib/RedisSubscriptionSupervisor');
var redisSubscribers = new RedisSubscriptionSupervisor(redisClient, clearRedisKeys);
var connectionID = 1;

function sendSSRs(channel, SSRs) {
    var plainText = JSON.stringify({ SSRs: SSRs });
    redisSubscribers.checkSubscriptions(channel, redisClient, function(hasSubscribers) {
        if (hasSubscribers) {
            // If there exists a redis subscriber (on any chloe instance) publish the message
            console.log((new Date()) + " Publishing SSRs to the Redis queue");
            redisClient.publish(channel, JSON.stringify(Cryptography.encrypt(plainText, publicKey)));
        } else {
            // No clients are subscribed, pass the info to redisSubscribers so that it can publish when someone subscribes
            console.log((new Date()) + " Adding SSRs to the message queue pending subscribers");
            redisSubscribers.queueMessage(channel, JSON.stringify(Cryptography.encrypt(plainText, publicKey)), redisClient);
        }
    });
}

function sendUpdate(userHash, channel, master) {
    // Sends updated user information over the master channel so that globalsearch can update its list
    redisSubscribers.getAllSubscriptionsByUser(userHash, redisClient, function(userInfo) {
        var plainText = JSON.stringify({
            channel: getClientSafeChannelName(channel),
            userInfo: userInfo
        });
        redisClient.publish(master, JSON.stringify(Cryptography.encrypt(plainText, publicKey)));
    });
}

function getClientSafeChannelName(channel) {
    // The client only knows about the last piece of the channel, so let's keep it that way
    var channelParts = channel.split('_');
    return channelParts[channelParts.length - 1];
}

function md5(value) {
    return crypto.createHash('md5').update(value).digest('hex');
}

function getUserSpecificString(userInfo){
    var userSpecificString = md5(userInfo.principal);
    return userSpecificString;
}
var util = require("util");

wss.on('connection', function(ws) {
    console.log((new Date()) + " WebSocket server received connection");

    ws.on('message', function(message) {
        ezbakeSecurityClient.fetchTokenForProxiedUser(this.upgradeReq, function(err, token) {
            if (err) {
                console.error((new Date()) + " EzSecuruity returned an error: \n\t" + err +
                        "\n" + (new Date()) + " Throwing EzSecuruity error.");
                throw err;
            }

            var userInfo = token.tokenPrincipal;

            message = JSON.parse(message);
            var master = "globalsearch" + "_" + getUserSpecificString(userInfo) + "_" + "master";
            var channel = message.app + "_" + getUserSpecificString(userInfo) + "_" + message.channel;

            if (typeof ws.id === "undefined") {
                ws.id = connectionID;
                connectionID++;
                channels[ws.id] = channel;
            }

            if (message.status === "keep-alive") {
                // This is a ping to keep the web socket alive, no action needed
            }
            else if (message.SSRs) {
                if (message.user) {
                    redisSubscribers.getUserInfoForUser(message.user, redisClient, function(userInfo) {
                        channel = message.app + "_" + getUserSpecificString(userInfo) + "_" + message.channel;
                        sendSSRs(channel, message.SSRs);
                    });
                } else {
                    sendSSRs(channel, message.SSRs);
                }
            } else {
                // Subscribe to the redis queue
                console.log((new Date()) + ' %s subscribed to channel %s', ws.id, channel);
                var redisSubscriber = redis.createClient(ezConfig.properties["redis.port"], ezConfig.properties["redis.host"]);
                var appInfo = { appName: message.app, channel: message.channel };
                redisSubscribers.subscribe(channel, redisSubscriber, userInfo, appInfo, redisClient);
                // When a redis queue message is received, pass the message along via websocket
                (function (websocket) {
                    redisSubscriber.on("message", function(channel, message) {
                        try {
                            var decryptedText = Cryptography.decrypt(JSON.parse(message), privateKey);

                            console.log((new Date()) + " Attempting to forward message to WebSocket. \n\t" +
                                    "Message body: " + decryptedText);
                            websocket.send(decryptedText);
                        } catch (err) {
                            console.error((new Date()) + " Error forwarding message to WebSocket. \n\t" + err);
                        }
                    });
                })(ws);
                (function (websocketId, redisSubscriber, master, channel, userHash) {
                    redisSubscriber.on("ready", function() {
                        redisSubscribers.add(websocketId, redisSubscriber, channel, redisClient);
                        sendUpdate(userHash, channel, master);
                    });
                })(ws.id, redisSubscriber, master, channel, md5(JSON.stringify(userInfo.principal)));
            }
        });
    });

    ws.on('close', function() {
        console.log((new Date()) + " Received close");

        ezbakeSecurityClient.fetchTokenForProxiedUser(this.upgradeReq, function(err, token) {
            if (err) {
                console.error((new Date()) + " EzSecuruity returned an error: \n\t" + err +
                        "\n" + (new Date()) + " Throwing EzSecuruity error.");
                throw err;
            }

            var userInfo = token.tokenPrincipal;

            var master = "globalsearch" + "_" + getUserSpecificString(userInfo) + "_" + "master";
            var subscriber = redisSubscribers.get(ws.id);

            if (subscriber) {
                redisSubscribers.unsubscribe(channels[ws.id], subscriber, userInfo, redisClient, function(userHash) {
                    console.log((new Date()) + " " + ws.id + ' disconnected from channel ' + channels[ws.id]);

                    // Send a message over the master channel letting the Chloe client know which channel was closed
                    if (channels[ws.id] !== master) {
                        var channel = channels[ws.id];
                        sendUpdate(userHash, channel, master);
                    }
                });
            }
        });
    });
});
