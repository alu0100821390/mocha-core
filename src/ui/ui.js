import stampit from 'stampit';
import {Decoratable, EventEmittable, Streamable} from '../core';
import {Kefir} from 'kefir';
import {constant, curry} from 'lodash/fp';
import Suite from './suite';
import Test from './test';
import is from 'check-more-types';

const UI = stampit({
  refs: {
    recursive: true
  },
  methods: {
    write: curry(function write (pool, value) {
      pool.plug(Kefir.constant(value));
      return this;
    }),
    createExecutable (Factory, definition = {}, opts = {}) {
      if (!Factory) {
        throw new Error('Factory function required');
      }
      this.write(this.dynamo$, {
        Factory: Factory.refs(definition),
        opts
      });
      return this;
    },
    createSuite (definition = {}, opts = {}) {
      this.createExecutable(Suite, definition, opts);
      return this;
    },
    createTest (definition = {}, opts = {}) {
      this.createExecutable(Test, definition, opts);
      return this;
    },
    retries (num) {
      this.context.retries(num);
      return this;
    },
    afterTests () {

    },
    beforeTests () {

    },
    afterEachTest () {

    },
    beforeEachTest () {

    }
  },
  init () {
    const dynamo$ = this.dynamo$ = Kefir.pool();
    const suite$ = this.suite$ = Kefir.pool();

    const writeExecutable = this.write(this.executable$);

    /**
     * Set the current suite by plugging it into the suite$ stream
     * @param {Suite} suite
     */
    const setCurrentSuite = suite => {
      suite$.plug(Kefir.constant(suite));
    };

    /**
     * Sets the context from a Suite.
     */
    const setContext = ({context}) => {
      this.context = context;
      this.emit('ui:context', context);
    };

    suite$.onValue(setContext);

    // summary:
    // - get the current suite (`parent` param)
    // - instantiate the Executable with the `parent`
    // - plug into the executable$ pool for the runner to handle
    // - once the runner begins to execute a Suite, set it current
    // - once the execution is done, set the *parent* to current
    const executing$ = dynamo$.combine(suite$, ({Factory, opts}, parent) => ({
      // HEADS UP! this is where the actual Executable object is
      // instantiated.  it doesn't matter if it's a Test or a Suite
      // or a Hook at this point.
      executable: Factory.refs({parent})
        .create(),
      opts
    }))
      .onValue(({executable}) => writeExecutable(executable));

    executing$.filter(({executable}) => is.test(executable))
      .map(({executable}) => executable)
      .onValue(test => {
        this.emit('ui:test', test);
      });

    executing$.filter(({executable}) => is.suite(executable))
      .map(({executable}) => executable)
      .onValue(suite => {
        this.emit('ui:suite', suite);
      })
      .flatMap(suite => suite.eventStream(
        'suite:execute:begin')
        .take(1)
        .map(constant(suite)))
      .onValue(setCurrentSuite)
      .flatMap(suite => suite.eventStream(
        'suite:execute:end')
        .take(1)
        .map(constant(suite.parent)))
      .onValue(setCurrentSuite);

    // begin by plugging the root Suite into the stream, so it
    // becomes current, and the context is set.
    setCurrentSuite(Suite.root);
  }
})
  .compose(EventEmittable, Decoratable, Streamable);

export default UI;
