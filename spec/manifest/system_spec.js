import { Q, config, async, path } from 'azk';
import h from 'spec/spec_helper';
import { Image  } from 'azk/images';
import { System } from 'azk/manifest/system';
import { Manifest } from 'azk/manifest';
import { Balancer } from 'azk/agent/balancer';
import { SystemDependError } from 'azk/utils/errors';
import docker from 'azk/docker';

var default_img = config('docker:image_default');

describe("Azk system class", function() {
  it("should return a System class", function() {
    var sys = new System({ ns: 'azk-test' }, 'sysname', default_img);
    h.expect(sys).to.have.property('manifest').and.eql({ ns: 'azk-test' });
    h.expect(sys).to.have.property('name', 'sysname');
    h.expect(sys).to.have.property('image').to.eql(new Image(default_img));
  });

  describe("with loaded system", function() {
    var manifest, system, db_system;

    before(() => {
      var data = { };
      return h.mockManifest(data).then((dir) => {
        manifest  = new Manifest(dir);
        system    = manifest.systems.example;
        db_system = manifest.systems.db;

        // Add extras
        system.options.sync_files[__dirname] = "/spec";
      });
    });

    it("should not run system if its dependencies are not met", function() {
      return h.expect(system.scale(1)).to.eventually.rejectedWith(SystemDependError)
    });

    describe("and have one instances", function() {
      before(() => {
        return manifest.systems.db.scale(1).then(() => {
          return system.scale(1)
        });
      });
      after(()  => {
        return Q.all([system.killAll(), db_system.killAll()]);
      });

      it("should return a number of instances", function() {
        return async(function* () {
          h.expect(yield system.instances()).to.length(1);
          h.expect(yield db_system.instances()).to.length(1);
        });
      });

      it("should scale up and down instances", function() {
        return async(function* () {
          yield system.scale(2);
          var instances = yield system.instances();
          h.expect(instances).to.length(2);

          yield system.scale(1);
          instances = yield system.instances();
          h.expect(instances).to.length(1);
        });
      });

      describe("and get a instance", function() {
        var instance, instances;

        before(() => {
          return async(function* () {
            instances = yield system.instances();
            instance  = yield docker.getContainer(instances[0].Id).inspect();
          });
        })

        it("should set command and working dir", function() {
          var dir = manifest.manifestDirName;
          h.expect(instance).to.have.deep.property('Config.WorkingDir', '/azk/' + dir);
        });

        it("should bind port", function() {
          h.expect(instances).to.have.deep.property('[0].Ports[0]');
          var port = instances[0].Ports[0];
          h.expect(port).to.have.property('IP', '0.0.0.0');
          h.expect(port).to.have.property('PublicPort');
          h.expect(port).to.have.property('Type', 'tcp');
        });

        it("should mount a sync_files", function() {
          h.expect(instance).to.have.deep.property('HostConfig.Binds[0]')
            .to.match(RegExp(manifest.manifestPath + ":/azk/" + manifest.manifestDirName));
          h.expect(instance).to.have.deep.property('HostConfig.Binds[1]')
            .to.match(RegExp(__dirname + ":/spec"));
        });

        it("should add log volume and change command", function() {
          var log_path = '/azk/__logs/' + system.name + '.log';
          var log_dir  = path.join(config('paths:logs'), manifest.namespace);
          h.expect(instance).to.have.deep.property('HostConfig.Binds[2]')
            .and.to.match(RegExp(log_dir + ":/azk/__logs"));
          h.expect(instance).to.have.deep.property('Config.Cmd')
            .and.eql(['/bin/sh', '-c', "( " + system.options.command + " ) >> " + log_path]);
        });

        it("should add and remove from balancer", function() {
          return async(function* () {
            var balancer = system.options.balancer;
            var alias = [...balancer.alias, balancer.hostname ];

            for (var host of alias) {
              var backends = yield Balancer.getBackends(host);
              h.expect(backends).to.have.deep.property('[0]', host);
              h.expect(backends).to.have.deep.property('[1]')
                .and.match(RegExp("http://" + h.escapeRegExp(config('agent:vm:ip'))));
            }
          });
        });

        it("shuld map depends envs", function() {
          var envs = instance.Config.Env;
          h.expect(envs).to.include('PORT=3000');
          h.expect(envs).to.include('AZK_NAME=' + instance.Name.slice(1));
          h.expect(envs).to.include('DB_HOST='  + config('agent:vm:ip'));
        });
      });
    });
  });
});
