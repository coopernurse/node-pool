# Change Log

## [2.4.2] - March 26 2016
- Travis now runs and fails lint checks (@kevinburke)
- fixed bug #128 where using async validation incorrectly tracked resource state (@johnjdooley and @robfyfe)
- fixed broken readme example that had aged badly

## [2.4.1] - February 20 2016
- Documented previously created/fixed bug #122 (thanks @jasonrhodes)
- Improved Makefile and test runner docs thanks (@kevinburke)
- fixed bug documented in #121 where pool could make incorrect decisions about which resources were eligible for removal. (thanks @mikemorris)

## [2.4.0] - January 18 2016
- Merged #118 - closes #110 - optional eslinting for test and lib using "standard" ruleset
- Merged #114 - closes #113 - "classes" now used internally instead of object literals and exports support being called as a constructor (along with old factory behaviour) (contributed by @felixfbecker)
- Move history from README.md to CHANGELOG.md and reformat
- Closes #122 - fixes trapped connection bug when destroying a connection while others are in use

## [2.3.1] - January 7 2016
- Documentation fixes and widened number of nodejs versions tested on travis

## [2.3.0] - January 1 2016
- Merged #105 - allow asynchronous validate functions (contributed by @felipou)

## [2.2.2] - December 13 2015
- Merged #106 - fix condition where non "resource pool" created objects could be returned to the pool. (contributed by @devzer01)

## [2.2.1] - October 30 2015
- Merged #104 - fix #103 - condition where pool can create > specified max number of connections (contributed by @devzer01)

## [2.2.0] - March 26 2015
- Merged #92 - add getMaxPoolSize function (contributed by platypusMaximus)

## [2.1.1] - July 5 2015
- fix README error about priority queueing (spotted by @kmdm)

## [2.1.0] - June 19 2014
- Merged #72 - Add optional returnToHead flag, if true, resources are returned to head of queue (stack like behaviour) upon release (contributed by calibr), also see #68 for further discussion.

## [2.0.4] - July 27 2013
- Merged #64 - Fix for not removing idle objects (contributed by PiotrWpl)

## [2.0.3] - January 16 2013
- Merged #56/#57 - Add optional refreshIdle flag. If false, idle resources at the pool minimum will not be destroyed/re-created. (contributed by wshaver)
- Merged #54 - Factory can be asked to validate pooled objects (contributed by tikonen)

## [2.0.2] - October 22 2012
- Fix #51, #48 - createResource() should check for null clientCb in err case (contributed by pooyasencha)
- Merged #52 - fix bug of infinite wait when create object aync error (contributed by windyrobin)
- Merged #53 - change the position of dispense and callback to ensure the time order (contributed by windyrobin)

## [2.0.1] - August 29 2012
- Fix #44 - leak of 'err' and 'obj' in createResource()
- Add devDependencies block to package.json
- Add travis-ci.org integration

## [2.0.0] - July 31 2012
- Non-backwards compatible change: remove adjustCallback
  - acquire() callback must accept two params: (err, obj)
- Add optional 'min' param to factory object that specifies minimum number of resources to keep in pool
- Merged #38 (package.json/Makefile changes - contributed by strk)

## [1.0.12] - June 27 2012
- Merged #37 (Clear remove idle timer after destroyAllNow - contributed by dougwilson)

## [1.0.11] - June 17 2012
- Merged #36 ("pooled" method to perform function decoration for pooled methods - contributed by cosbynator)

## [1.0.10] - May 3 2012
- Merged #35 (Remove client from availbleObjects on destroy(client) - contributed by blax)

## [1.0.9] - Dec 18 2011
- Merged #25 (add getName() - contributed by BryanDonovan)
- Merged #27 (remove sys import - contributed by botker)
- Merged #26 (log levels - contributed by JoeZ99)

## [1.0.8] - Nov 16 2011
- Merged #21 (add getter methods to see pool size, etc. - contributed by BryanDonovan)

## [1.0.7] - Oct 17 2011
- Merged #19 (prevent release on the same obj twice - contributed by tkrynski)
- Merged #20 (acquire() returns boolean indicating whether pool is full - contributed by tilgovi)

## [1.0.6] - May 23 2011
- Merged #13 (support error variable in acquire callback - contributed by tmcw)
  - Note: This change is backwards compatible.  But new code should use the two parameter callback format in pool.create() functions from now on.
- Merged #15 (variable scope issue in dispense() - contributed by eevans)

## [1.0.5] - Apr 20 2011
- Merged #12 (ability to drain pool - contributed by gdusbabek)

## [1.0.4] - Jan 25 2011
- Fixed #6 (objects reaped with undefined timeouts)
- Fixed #7 (objectTimeout issue)

## [1.0.3] - Dec 9 2010
- Added priority queueing (thanks to sylvinus)
- Contributions from Poetro
  - Name changes to match conventions described here: http://en.wikipedia.org/wiki/Object_pool_pattern
    - borrow() renamed to acquire()
    - returnToPool() renamed to release()
  - destroy() removed from public interface
  - added JsDoc comments
  - Priority queueing enhancements

## [1.0.2] - Nov 9 2010
- First NPM release

[unreleased]: https://github.com/coopernurse/node-pool/compare/v2.4.2...HEAD
[2.4.2]: https://github.com/coopernurse/node-pool/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/coopernurse/node-pool/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/coopernurse/node-pool/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/coopernurse/node-pool/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/coopernurse/node-pool/compare/v2.2.2...v2.3.0
[2.2.2]: https://github.com/coopernurse/node-pool/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/coopernurse/node-pool/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/coopernurse/node-pool/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/coopernurse/node-pool/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/coopernurse/node-pool/compare/v2.0.4...v2.1.0
[2.0.4]: https://github.com/coopernurse/node-pool/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/coopernurse/node-pool/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/coopernurse/node-pool/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/coopernurse/node-pool/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/coopernurse/node-pool/compare/v1.0.12...v2.0.0
