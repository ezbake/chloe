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

/**
 * The first time that you open something in Chloe, nothing is subscribed.  So, we keep track of the message in
 * the "chloe:message-queue" until some subscriber is ready to consume it. However, since there could be multiple 
 * instances of Chloe, we want to prevent multiple instances from updating this object at the same time, so
 * we lock "chloe:message-queue" before updating it.
 */
var crypto = require("crypto");

// Key to retrieve the object stored in Redis where keys are channels and values are messages to be sent 
// when a new client subscribes to the channel
const CHLOE_MESSAGE_QUEUE_REDIS_KEY = "chloe:message-queue";

// Key to retrieve the object stored in Redis where keys are channels and values are arrays of objects
// containing both appInfo (appName, channel) and the userInfo obtained from the security token
const CHLOE_SUBSCRIPTIONS_REDIS_KEY = "chloe:subscriptions";

function md5(value) {
    return crypto.createHash('md5').update(value).digest('hex');
}

function handleRedisError(err) {
    console.error((new Date()) + " Redis returned an error: \n\t" + err +
            "\n" + (new Date()) + " Throwing Redis error.");
    throw err;
}

function initRedisValue(key, lock, redisClient, clearRedisKeys) {
    // check to see if the key exists in redis and if not, initialize it to an empty object
    lock(key, function(done) {
        console.log((new Date()) + " Lock acquired on Redis key: " + key);
        redisClient.get(key, function(err, reply) {
            if (err) {
                handleRedisError(err);
            }

            if (clearRedisKeys || !reply) {
                redisClient.set(key, "{}", function(err, reply) {
                    if (err) {
                        handleRedisError(err);
                    }
                    done(function() {
                        console.log((new Date()) + " Lock relinquished on Redis key: " + key);
                    });
                });
            } else {
                done(function() {
                    console.log((new Date()) + " Lock relinquished on Redis key: " + key);
                });
            }
        });
    });
}

function RedisSubscriptionSupervisor(redisClient, clearRedisKeys) {
    // key-value pairs where key is the websocket id and value is the redis subscriber
    this.redisSubscribers = {};
    this.lock = require("redis-lock")(redisClient);

    initRedisValue(CHLOE_MESSAGE_QUEUE_REDIS_KEY, this.lock, redisClient, clearRedisKeys);
    initRedisValue(CHLOE_SUBSCRIPTIONS_REDIS_KEY, this.lock, redisClient, clearRedisKeys);
}

RedisSubscriptionSupervisor.prototype.get = function(id) {
    return this.redisSubscribers[id];
};

RedisSubscriptionSupervisor.prototype.add = function(id, subscriber, channel, redisClient) {
    this.redisSubscribers[id] = subscriber;

    this.lock(CHLOE_MESSAGE_QUEUE_REDIS_KEY, function(done) {
        console.log((new Date()) + " Lock acquired on Redis key: " + CHLOE_MESSAGE_QUEUE_REDIS_KEY);
        redisClient.get(CHLOE_MESSAGE_QUEUE_REDIS_KEY, function(err, reply) {
            if (err) {
                handleRedisError(err);
            }

            var messageQueue = JSON.parse(reply);
            if (messageQueue && messageQueue[channel]) {
                console.log((new Date()) + " Publishing SSRs in message queue to new subscriber");
                redisClient.publish(channel, messageQueue[channel]);
                delete messageQueue[channel];
                redisClient.set(CHLOE_MESSAGE_QUEUE_REDIS_KEY, JSON.stringify(messageQueue), function(err, reply) {
                    if (err) {
                        handleRedisError(err);
                    }
                    done(function() {
                        console.log((new Date()) + " Lock relinquished on Redis key: " + CHLOE_MESSAGE_QUEUE_REDIS_KEY);
                    });
                });
            } else {
                done(function() {
                    console.log((new Date()) + " Lock relinquished on Redis key: " + CHLOE_MESSAGE_QUEUE_REDIS_KEY);
                });                
            }
        });
    });
};

RedisSubscriptionSupervisor.prototype.queueMessage = function(channel, message, redisClient) {
    this.lock(CHLOE_MESSAGE_QUEUE_REDIS_KEY, function(done) {
        console.log((new Date()) + " Lock acquired on Redis key: " + CHLOE_MESSAGE_QUEUE_REDIS_KEY);
        redisClient.get(CHLOE_MESSAGE_QUEUE_REDIS_KEY, function(err, reply) {
            if (err) {
                handleRedisError(err);
            }

            var messageQueue = JSON.parse(reply);
            messageQueue[channel] = message;

            redisClient.set(CHLOE_MESSAGE_QUEUE_REDIS_KEY, JSON.stringify(messageQueue), function(err, reply) {
                if (err) {
                    handleRedisError(err);
                }
                done(function() {
                    console.log((new Date()) + " Lock relinquished on Redis key: " + CHLOE_MESSAGE_QUEUE_REDIS_KEY);
                });
            });
        });
    });
};

RedisSubscriptionSupervisor.prototype.subscribe = function(channel, subscriber, userInfo, appInfo, redisClient) {
    this.lock(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(done) {
        console.log((new Date()) + " Lock acquired on Redis key: " + CHLOE_SUBSCRIPTIONS_REDIS_KEY);
        redisClient.get(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(err, reply) {
            if (err) {
                handleRedisError(err);
            }

            // Subscribe to the channel
            subscriber.subscribe(channel);

            // Update the bookkeeping object to indicate that this channel has one additional subscriber
            var subscriptions = JSON.parse(reply);
            if (Object.prototype.toString.call(subscriptions[channel]) !== '[object Array]') {
                subscriptions[channel] = []
            }

            // Since the md5 hash of the user principal is used as part of the redis channel name, use 
            // the md5 hash of the whole user object so that the channel name can't be derived from it
            userInfo.md5 = md5(JSON.stringify(userInfo));
            subscriptions[channel].push({ appInfo: appInfo, userInfo: userInfo });
            redisClient.set(CHLOE_SUBSCRIPTIONS_REDIS_KEY, JSON.stringify(subscriptions), function(err, reply) {
                if (err) {
                    handleRedisError(err);
                }
                done(function() {
                    console.log((new Date()) + " Lock relinquished on Redis key: " + CHLOE_SUBSCRIPTIONS_REDIS_KEY);
                });
            });
        });
    });
};

RedisSubscriptionSupervisor.prototype.unsubscribe = function(channel, subscriber, userInfo, redisClient, callback) {
    this.lock(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(done) {
        console.log((new Date()) + " Lock acquired on Redis key: " + CHLOE_SUBSCRIPTIONS_REDIS_KEY);
        redisClient.get(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(err, reply) {
            if (err) {
                handleRedisError(err);
            }

            // Unsubscribe from the channel
            subscriber.unsubscribe(channel);

            // Update the bookkeeping object to indicate that this channel has one fewer subscriber
            var subscriptions = JSON.parse(reply);
            var index;
            userInfo.md5 = md5(JSON.stringify(userInfo));
            for (var i = 0; i < subscriptions[channel].length; i++) {
                if (userInfo.md5 === subscriptions[channel][i].userInfo.md5) {
                    index = i;
                    break;
                }
            }
            subscriptions[channel].splice(index, 1);
            if (subscriptions[channel].length === 0) {
                delete subscriptions[channel];
            }
            redisClient.set(CHLOE_SUBSCRIPTIONS_REDIS_KEY, JSON.stringify(subscriptions), function(err, reply) {
                if (err) {
                    handleRedisError(err);
                }
                done(function() {
                    console.log((new Date()) + " Lock relinquished on Redis key: " + CHLOE_SUBSCRIPTIONS_REDIS_KEY);
                    callback(userInfo.md5);
                });
            });
        });
    });
};

RedisSubscriptionSupervisor.prototype.checkSubscriptions = function(channel, redisClient, callback) {
    redisClient.get(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(err, reply) {
        if (err) {
            handleRedisError(err);
        }

        var subscriptions = JSON.parse(reply);
        callback(subscriptions[channel] && subscriptions[channel].length > 0);
    });
};

RedisSubscriptionSupervisor.prototype.getAllSubscriptionsByUser = function(userHash, redisClient, callback) {
    redisClient.get(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(err, reply) {
        if (err) {
            handleRedisError(err);
        }

        var subscriptions = JSON.parse(reply);
        var userInfo = { "me": userHash };
        var users = {};

        // Convert the subscriptions object into something friendlier for the globalsearch client
        for (var channel in subscriptions) {
            for (var i = 0; i < subscriptions[channel].length; i++) {
                var key = subscriptions[channel][i].userInfo.md5;
                if (subscriptions[channel][i].appInfo.channel !== "master") {
                    if (key in users) {
                        users[key].appInfo.push(subscriptions[channel][i].appInfo);
                    } else {
                        users[key] = { 
                            name: subscriptions[channel][i].userInfo.name,
                            appInfo: [subscriptions[channel][i].appInfo], 
                        };
                    }
                }
            }
        }

        userInfo["users"] = users;
        callback(userInfo);
    });
};

RedisSubscriptionSupervisor.prototype.getUserInfoForUser = function(userHash, redisClient, callback) {
    redisClient.get(CHLOE_SUBSCRIPTIONS_REDIS_KEY, function(err, reply) {
        if (err) {
            handleRedisError(err);
        }

        var subscriptions = JSON.parse(reply);
        var userInfo;

        for (var channel in subscriptions) {
            for (var i = 0; i < subscriptions[channel].length; i++) {
                if (userHash === subscriptions[channel][i].userInfo.md5) {
                    userInfo = subscriptions[channel][i].userInfo;
                    break;
                }
            }
            if (userInfo) {
                break;
            }
        }

        callback(userInfo);
    });
}

module.exports = RedisSubscriptionSupervisor;
