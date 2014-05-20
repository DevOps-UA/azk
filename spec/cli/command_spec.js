import h from 'spec/spec_helper';
import { t, _ } from 'azk';
import { Command, UI as OriginalUI } from 'azk/cli/command';
import {
  InvalidOptionError,
  InvalidValueError,
  RequiredOptionError
} from 'azk/utils/errors';

var path   = require('path');
var printf = require('printf');
var stripIdent = require("strip-indent");

describe.only('Azk cli command module', function() {
  var outputs = [];
  beforeEach(() => outputs = []);

  // Mock UI
  var UI = _.clone(OriginalUI);
  UI.dir    = (...args) => outputs.push(...args);
  UI.stdout = () => { return {
    write(data) {
      outputs.push(data.replace(/(.*)\n/, "$1"));
    }
  }};

  class TestCmd extends Command {
    action(opts) {
      this.dir(opts);
    }

    tKeyPath(...keys) {
      return ['test', 'commands', this.name, ...keys];
    }
  }

  describe("with a simple options", function() {
    var cmd = new TestCmd('test_options', UI);
    cmd
      .addOption(['--verbose', '-v'])
      .addOption(['--flag'   , '-f'])
      .addOption(['--number' , '-n'], { type: Number })
      .addOption(['--size'], { options: ["small", "big"] });

    it("should parse args and exec", function() {
      cmd.run(['--number', '1', '-fv']);
      h.expect(outputs).to.eql([{ number: 1, verbose: true, flag: true, __leftover: [] }]);
    });

    it("should support --no-option and false value", function() {
      cmd.run(['--no-verbose', '--flag', 'false']);
      h.expect(outputs).to.eql([{verbose: false, flag: false, __leftover: [] }]);
    });

    it("should support --option=value", function() {
      cmd.run(['--number=20']);
      h.expect(outputs).to.eql([{number: 20, __leftover: []}]);
    });

    it("should support valid options", function() {
      cmd.run(['--size', 'small']);
      h.expect(outputs).to.deep.property("[0].size", "small");

      var func = () => cmd.run(['--size', 'invalid_value']);
      h.expect(func).to.throw(InvalidValueError, /invalid_value.*size/);
    });

    it("should raise a invalid option", function() {
      h.expect(() => cmd.run(['--invalid'])).to.throw(InvalidOptionError);
    });
  });

  describe("with a sub commands and options", function() {
    var cmd = new TestCmd('test_sub {sub_command} [sub_command_opt]', UI);
    cmd.setOptions('sub_command', { options: ['command1', 'command2'] });
    cmd.addOption(['--string', '-s'], { required: true, type: String });
    cmd.addOption(['--flag', '-f']);

    it("should be parse subcommand option", function() {
      cmd.run(['command1', 'command2', '--string', 'foo']);
      h.expect(outputs).to.eql([{
        sub_command: "command1",
        sub_command_opt: "command2",
        string: "foo",
        __leftover: []
      }]);
    });

    it("should support flag merged with subcommand", function() {
      cmd.run(["--flag", "command1", '--string', 'foo']);
      h.expect(outputs).to.deep.property("[0].sub_command", "command1");
      h.expect(outputs).to.deep.property("[0].flag", true);

      cmd.run(["--flag", "true", "command1", '--string', 'foo']);
      h.expect(outputs).to.deep.property("[1].sub_command", "command1");
      h.expect(outputs).to.deep.property("[1].flag", true);

      cmd.run(["--flag", "false", "command1", '--string', 'foo']);
      h.expect(outputs).to.deep.property("[2].sub_command", "command1");
      h.expect(outputs).to.deep.property("[2].flag", false);

      cmd.run(["--no-flag", "command1", '--string', 'foo']);
      h.expect(outputs).to.deep.property("[3].sub_command", "command1");
      h.expect(outputs).to.deep.property("[3].flag", false);
    });

    it("should be raise a required option", function() {
      var func = () => cmd.run([]);
      h.expect(func).to.throw(RequiredOptionError, /string/);

      var func = () => cmd.run(['--string=value']);
      h.expect(func).to.throw(RequiredOptionError, /sub_command/);
    });

    it("should support valid options", function() {
      cmd.run(['command2', '--string', 'foo']);
      h.expect(outputs).to.deep.property("[0].sub_command", "command2");

      var func = () => cmd.run(['invalid_value', '--string', 'foo']);
      h.expect(func).to.throw(InvalidValueError, /invalid_value.*sub_command/);
    });
  });

  describe("with a validate subcommand", function() {
    var cmd = new TestCmd('test_sub {*sub_command}', UI);
    cmd.addOption(['--string', '-s'], {
      type: String, desc: "String description"
    });
    cmd.addOption(['--flag']);

    it("should capture any think after sub_command", function() {
      cmd.run(['--string', 'foo', 'subcommand', "--sub-options"]);
      h.expect(outputs).to.eql([{
        sub_command: "subcommand",
        string: "foo",
        __leftover: ["--sub-options"]
      }]);
    });

    it("should capture any think even if a flag is used", function() {
      cmd.run(['--string', 'foo', '--flag', 'subcommand', "--sub-options"]);
      h.expect(outputs).to.eql([{
        sub_command: "subcommand",
        string: "foo",
        flag: true,
        __leftover: ["--sub-options"]
      }]);
    });
  });

  it("should raise directly command use", function() {
    var cmd  = new Command('test', UI);
    h.expect(() => cmd.run()).to.throw(Error, /Don't use/);
  });

  it("should a usage and help options", function() {
    var cmd = new TestCmd('test_help {subcommand} [command]', UI);
    cmd
      .addOption(['--verbose', '-v'])
      .addOption(['--string'], { type: String })
      .setOptions("subcommand", { options: ["start", "stop"] })
      .setOptions("command", { stop: true });

    cmd.showUsage();
    h.expect(outputs).to.deep.property("[00]", 'Usage: $ test_help [options] {subcommand} [*command]');
    h.expect(outputs).to.deep.property("[02]", 'Test help description');
    h.expect(outputs).to.deep.property("[04]", 'options:');
    h.expect(outputs).to.deep.property("[06]", '  --verbose, -v Verbose mode (default: true)');
    h.expect(outputs).to.deep.property("[07]", '  --string=""   String option');
    h.expect(outputs).to.deep.property("[09]", 'subcommand:');
    h.expect(outputs).to.deep.property("[10]", '  start Start service');
    h.expect(outputs).to.deep.property("[11]", '  stop  Stop service');
  });
});