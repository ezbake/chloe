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
 * Handles encryption and decryption for Chloe
 */
var crypto = require('crypto');
var ursa = require('ursa');

var encrypt = function(plainText, publicKey) {
    if (ursa.isPublicKey(publicKey) === false) {
        var error = new Error();
        error.message = 'publicKey param is not a valid public key'
        throw error;
    }
    var key = crypto.randomBytes(32);
    var iv = crypto.randomBytes(16);
    var keyString = key.toString('binary');
    var ivString = iv.toString('binary');
    var cipher = crypto.createCipheriv('aes-256-cbc', keyString, ivString);
    var cipherText = cipher.update(plainText, 'utf8', 'base64');
    cipherText += cipher.final('base64');
    var symmetricData = JSON.stringify({ key: keyString, iv: ivString });
    var encryptedSymmetricData = publicKey.encrypt(new Buffer(symmetricData));
    return { encryptedSymmetricData: encryptedSymmetricData, cipherText: cipherText };
};

var decrypt = function(encryptedMessage, privateKey) {
    if (ursa.isPrivateKey(privateKey) === false) {
        var error = new Error();
        error.message = 'privateKey param is not a valid private key'
        throw error;
    }
    var decryptedSymmetricData = JSON.parse(privateKey.decrypt(encryptedMessage.encryptedSymmetricData));
    var decipher = crypto.createDecipheriv('aes-256-cbc', decryptedSymmetricData.key, decryptedSymmetricData.iv);
    var decryptedText = decipher.update(encryptedMessage.cipherText, 'base64', 'utf8');
    decryptedText += decipher.final('utf8');
    return decryptedText;
}

module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
