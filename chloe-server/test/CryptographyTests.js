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

var assert = require("assert");

process.env.EZCONFIGURATION_DIR = "chloe-configuration";
var EzConfiguration = require('ezConfiguration');
var directoryLoader = new EzConfiguration.loaders.DirectoryConfigurationLoader();
ezConfig = new EzConfiguration.EzConfiguration(directoryLoader);
var ursa = require('ursa');
var fs = require('fs');
var path = require('path');
var cons = require('ezbakesecurityclient').Constant;
var publicKey = ursa.coercePublicKey(fs.readFileSync(path.join(ezConfig.getString(cons.SSL_DIR_KEY), cons.PUBLIC_KEY_FILE), "utf8"));
var privateKey = ursa.coercePrivateKey(fs.readFileSync(path.join(ezConfig.getString(cons.SSL_DIR_KEY), cons.PRIVATE_KEY_FILE), "utf8"));
var Cryptography = require('../lib/Cryptography');

describe('Cryptography', function() {
    describe('#encrypt()', function() {
        it('should encrypt the value', function() {
            var plainText = "I'm sorry Smokey, you were over. That's a foul";

            assert.notEqual(Cryptography.encrypt(plainText, publicKey), plainText);
        });

        it('should throw an error if the public key is not valid', function() {
            var plainText = "Smokey, this is not 'nam. This is bowling; there are rules."
            var message;

            try {
                Cryptography.encrypt(plainText, privateKey);
            } catch (err) {
                message = err.message;
            }

            assert.equal(message, 'publicKey param is not a valid public key');
        });
    });

    describe('#decrypt()', function() {
        it('should decrypt the value', function() {
            var plainText = "Uh, because of the metric system?";
            var cipherText = Cryptography.encrypt(plainText, publicKey);

            assert.equal(Cryptography.decrypt(cipherText, privateKey), plainText);
        });

        it('should throw an error if the private key is not valid', function() {
            var plainText = "Check out the big brain on Brad!";
            var cipherText = Cryptography.encrypt(plainText, publicKey);
            var message;

            try {
                Cryptography.decrypt(cipherText, publicKey);
            } catch (err) {
                message = err.message;
            }

            assert.equal(message, 'privateKey param is not a valid private key');
        });
    });
});
