/*eslint func-style: [2, "declaration"]*/
/*eslint no-debugger:0*/
/*eslint no-unused-vars: 0*/

import _ from 'underscore';
import DataCube from '../DataCube.js';

import {CompositeSpecification} from 'ts-specification';

export default class EvenlyDistributedSpec extends CompositeSpecification {

    dimElementCount(dim, obs) {

        const dimEls = obs.map(o => DataCube.getDimensionElementUri(dim, o).first()); //TODO is always array?
        return dimEls.countBy(dimEl => DataCube.getUri(dimEl));
    }

    isSatisfiedBy(dc) {
        const isEvenlyDistributed = dc.dimensions
            .map(dim => {
                const counts = this.dimElementCount(dim, dc.observations);
                const isUniq = _.uniq(_.values(counts.toJS())).length === 1; //TODO implement in Immutable js
                return isUniq;
            })
            .every(u => u);
        return isEvenlyDistributed;
    }
}
