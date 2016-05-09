/*eslint func-style: [2, "declaration"]*/
/*eslint complexity: [2, 4]*/
/*eslint no-debugger:0*/
/*eslint no-unused-vars: 0*/
/*eslint no-console: 0*/

import Immutable from 'immutable';

import * as Rules from './rules/Rules.js';
import * as Util from './Util.js';
import {convert} from './Converting.js';
import DataCube from './DataCube.js';

const comparison = {
    name: 'comparison',
    //return {rank: number, visual: type}
    eval(dataCube) {//HERE

        const results = {/*complex: this.name, visuals: []*/};
        let visuals = Immutable.List();

        const heatmapRule = new Rules.HeatmapRule(2, 20, 2);
        const isSatisfiedHeatmap = heatmapRule.isSatisfiedBy(dataCube);

        if (isSatisfiedHeatmap.first()) {
            visuals = visuals.push(isSatisfiedHeatmap.last().merge({rank: 1, name: 'heatmap'}));
        }

        const selectedDimensionRule = new Rules.SelectedDimensionRule(2, 10);
        const isSatisfiedSelectedDim = selectedDimensionRule.isSatisfiedBy(dataCube);
        if (isSatisfiedSelectedDim.first()) {

            visuals = visuals.withMutations(v => {
                v.push(isSatisfiedSelectedDim.last().merge({rank: 2, name: 'pieChart'}));
                v.push(isSatisfiedSelectedDim.last().merge({rank: 2, name: 'barChart'}));
            });
        }
        //
        // const groupedStackedBarRule = new Rules.GroupedStackedBarRule(20);
        // const isSatisfiedGStackedBar = groupedStackedBarRule.isSatisfiedBy(dataCube);
        //
        // if (_.first(isSatisfiedGStackedBar)) {
        //     results.visuals.push(_.extend({rank: 0, name: 'groupedStackedBar'}, _.last(isSatisfiedGStackedBar)));
        // }

        return Immutable.Map({complex: 'comparison', visuals});
    }
};

const maxNumber = {
    name: 'maxNumber',

    eval(dataCube) {

        // const results = {complex: this.name, visuals: []};
        //
        // const heatmapRule = new Rules.HeatmapRule(2, 10, 2);
        // const isSatisfiedHeatmap = heatmapRule.isSatisfiedBy(dataCube);
        //
        // if (_.first(isSatisfiedHeatmap)) {
        //     results.visuals.push(_.extend({rank: 2, name: 'heatmap'}, _.last(isSatisfiedHeatmap)));
        // }
        //
        // return results;
    }
};

// Contexts

const testContext = {
    id: 0,
    name: 'Test Context',
    description: 'Test context. Contains multiple complexes.',
    complexes: [comparison/*,maxNumber*/]
};

export const Contexts = Immutable.fromJS([testContext]);

// Discards every observation point not in dimensions
// dimensionsMap: {dimension: dim, dimEls: [...]}
function selectObservations(dimensionsMap, dataCube) {
    return dataCube.getAllObservations().
        filter(o => dimensionsMap.every(dim_ => {
            return dim_.get('dimEls').some(dimEl => DataCube.observationContainsDimEl(o, dimEl));
        }));
}

//Returns list with dimensions and according dimension elements
function selectDimensions(dimEls, dataCube) {

    return dimEls.reduce((list, dimEl) => {
        const dim = dataCube.getDimension(dimEl);

        if (list.find(d => d.get('@id') === dim.get('@id'))) {
            return list;
        }

        return list.push(dim);
    }, Immutable.List());
}

export function createDataCube(selections, dataCube) {

    const dimensions = selectDimensions(selections, dataCube);
    const dimensionsMap = dimensions.map(dim => Immutable.Map({
        dimension: dim,
        dimEls: selections.filter(s => dim.get('@id') === s.get('@type').first())
    }));
    const observations = selectObservations(dimensionsMap, dataCube);

    console.log('DIM: ');
    console.log(dimensions.toJS());
    console.log('OBS: ');
    console.log(observations.toJS());

    const dc = dataCube.createDataCube(selections, dimensions, observations);
    return dc;
}

export function determineVisuals(context, dataCube) {

    const test = Contexts.first();
    return test.get('complexes').map(c => c.get('eval')(dataCube));
}
/*eslint-disable */
export function displayChart(visual, dataCube) {
  /*eslint-enable */
    return convert(visual, dataCube);
}

export function displayConfigureDimensions(dataCube) {

    return dataCube.allDimensionElements;
    // return dataCube.get('dimensions')
    //     .flatMap(dim => { return Util.getDimensionElements(dim, dataCube).flatten(true); });
}