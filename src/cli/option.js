import { _, t } from 'azk';
import { InvalidValueError } from 'azk/utils/errors';

var boolean_opts = ['1', '0', 'false', 'true', false, true];

export class Option {
  constructor(opts) {
    this.name      = opts.name;
    this.desc      = opts.desc;
    this.alias     = opts.alias;
    this._type     = opts.type;
    this.required  = opts.required;
    this.options   = opts.options;
    this.stop      = opts.stop;

    if (_.has(opts, 'default'))
      this._default = opts.default;
  }

  get default() {
    return _.has(this, '_default') ? this._default : (
      this.type == Boolean ? true : null
    )
  }

  set default(value) {
    this._default = value;
  }

  set type(value) {
    this._type = value;
  }

  get type() {
    return this._type || (_.isArray(this.options) ? String : Boolean);
  }

  help(desc) {
    var help = [];

    // Names
    var names = _.map(this.alias, (alias) => {
      return ((alias.length > 1) ? '--' : '-') + alias;
    });

    switch(this.type) {
      case String:
        names[0] += `="${this.default != null ? this.default : ''}"`;
        break;
      case Boolean:
        desc += ` (default: ${this.default})`;
        break;
    }

    return [names.join(', '), desc].join('\t');
  }

  helpValues(tKey) {
    var help = [];

    _.each(this.options, (opt) => {
      help.push(opt + '\t' + t([...tKey, opt]));
    });

    return help;
  }

  processValue(value) {
    switch(this.type) {
      case String:
        if (_.isArray(this.options) && !_.contains(this.options, value)) {
          throw new InvalidValueError(this.name, value);
        }
        return value;
      case Number:
        return value.match(/^-?[\d|.|,]*$/) ? Number(value) : null;
      default:
        if (!_.contains(boolean_opts, value))
          throw new InvalidValueError(this.name, value);
        return (value == "true" || value == 1) ? true : false;
    }
  }
}