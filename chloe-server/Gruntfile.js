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

module.exports = (function (grunt) {
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-shell');

  var execute = function (command, args, path, callback, context){
    var cmd = require("child_process").spawn(command, args, { cwd: path });
    cmd.stdout.setEncoding("utf8");
    cmd.stdout.on("data", function (data) {
      console.log(data);
    });
    cmd.stderr.setEncoding("utf8");
    cmd.stderr.on("data", function (data) {
      console.log(data);
    });
    if (callback !== undefined) {
      cmd.on("exit", function (code) {
        callback.apply((context || this), [code]);
      });
    }
  };

  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    clean: {
      build: "./build/",
    },
    copy: {
      build: {
        cwd: "./",
        src: "**/*",
        dest: "./build/target/"
      },
      deployer: {
        src: "./chloe.yml",
        dest: "./build/release/chloe.yml"
      }
    },
    shell: {
      pack: {
        options: {
          execOptions: {
            cwd: "./build/target/",
            maxBuffer: NaN
          }
        },
        command: "tar -cvzf ../release/chloe-server.tar.gz ./"
      },
    }
  });

  grunt.registerTask("mkdir:release", function () {
    grunt.file.mkdir("./build/release/");
  });

  grunt.registerTask("openshit-ify", function () {
    var pkg = "./build/target/package.json";
    var p = require(pkg);
    delete p.dependencies;
    delete p.devDependencies;
    delete p.optionalDependencies;
    require("fs").writeFileSync(pkg, JSON.stringify(p), { encoding: "utf8" });
  });

  grunt.registerTask("targetEnv:openshift", function () {
    var pkg = "./build/target/package.json";
    var p = require(pkg);
    p.environment = "openshift";
    require("fs").writeFileSync(pkg, JSON.stringify(p), { encoding: "utf8" });
  });

  grunt.registerTask("targetEnv:development", function () {
    var pkg = "./build/target/package.json";
    var p = require(pkg);
    p.environment = "development";
    require("fs").writeFileSync(pkg, JSON.stringify(p), { encoding: "utf8" });
  });

  grunt.registerTask("build:openshift", ["clean:build", "copy:build", "openshit-ify", "targetEnv:openshift", "mkdir:release", "copy:deployer", "shell:pack"]);
});
