const Pool = require('./lib/Pool')

exports.Pool = Pool

exports.createPool = function(factory, config){
  return new Pool(factory, config)
}

