/*eslint no-unused-vars: 0*/
/*eslint no-console: 0*/
/*eslint no-debugger: 0*/
/*eslint func-style: 0*/
/*eslint max-params: 0*/
/*eslint complexity: 0*/
/*eslint max-len: 0*/

import Promise from 'promise';
import RdfStore from 'rdfstore';
import {promises, jsonld} from 'jsonld';
import Immutable, {fromJS, Map} from 'immutable';
import * as Queries from '../ICQueries.js';

import Loggable from './Loggable.js';

class SparqlStore extends Loggable {

    allTriplesQuery() {
        return 'CONSTRUCT { ?s ?p ?o } ' +
            'WHERE { ?s ?p ?o .}';
    }

    datasetQuery() {
        return 'CONSTRUCT { ?s ?p ?o } ' +
        'WHERE { ' +
            '?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#DataSet>. ' +
            '?s ?p ?o . ' +
        '} ';
    }

    dsdQuery(dataset) {
        return 'CONSTRUCT  {?dsd ?p ?o}' +
                'WHERE { ' +
                    '<' + dataset + '> <http://purl.org/linked-data/cube#structure> ?dsd . ' +
                    '?dsd ?p ?o . ' +
                '}';
    }

    csQuery(dsd) {
        return 'CONSTRUCT {?cs ?p ?o} ' +
                'WHERE { ' +
                    '<' + dsd + '> <http://purl.org/linked-data/cube#component> ?cs . ' +
                    '?cs ?p ?o . ' +
                '}';
    }

    componentElementsQuery(component, dataset) {
        return 'CONSTRUCT { ?componentUri <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <' + component + '> .' +
                           '?componentUri ?p ?o . } ' +
        'WHERE { ' +
           '?ob <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#Observation>. ' +
           '?ob <http://purl.org/linked-data/cube#dataSet> <' + dataset + '>. ' +
           '?ob <' + component + '> ?componentUri. ' +
           'OPTIONAL { ?componentUri ?p ?o . }' +
        '}';
    }

    componentQuery(ds, dsd, componentType) {
        return 'CONSTRUCT   { ?comptype ?p ?o . }' +
            'WHERE { ' +
                '<' + ds + '> <http://purl.org/linked-data/cube#structure> <' + dsd + '>  . ' +
                '<' + dsd + '> <http://purl.org/linked-data/cube#component> ?comp . ' +
                '?comp <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#ComponentSpecification> .' +
                '?comp <' + componentType + '> ?comptype . ' +
                '?comptype ?p ?o. ' +
            '}';
    }

    observationsQuery(dataset) {
        return 'CONSTRUCT { ?s ?p ?o } ' +
            'WHERE { ' +
               '?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#Observation>. ' +
               '?s <http://purl.org/linked-data/cube#dataSet> <' + dataset + '>. ' +
               '?s ?p ?o . ' +
            '}';
    }

    constructor(triple) {
        super();

        this.triple = triple;
        this.internalStore = null;
        this.result = {};
        this.result.defaultLanguage = 'en';
    }

    mapComponentElementsToComponentTypes(componentElements, componentTypes) {
        return componentElements
            .reduce((map, dimEl, idx) => {
                const dimUri = fromJS(componentTypes)
                    .getIn([idx, '@id']);
                return map.set(dimUri, dimEl);
            }, Map()).toJS();
    }

    /**
     * parse - Parse graph object from rdfstore with jsonld.
     *
     * @param  {type} graph Graph object returned from rdfstrore by executing
     * a CONSTRUCT query.
     * @return {type} jsonld object array
     */
    parse(graph) {
        return promises.fromRDF(graph.toNT(), {format: 'application/nquads'});
    }

    execute(query) {
        this.log(this.constructor.name + ' Query:\n' + query);
        return new Promise((fulfill, reject) => {
            this.internalStore.execute(
                query, (err, res) => {
                    if (err) reject(err);
                    else fulfill(res);
                });
        });
    }

    create() {

        if (!this.triple)
            return Promise.reject('No triples!');

        return new Promise((fulfill, reject) => {
            RdfStore.create((err, store) => {
                if (err) reject(err);
                else fulfill(store);
            });
        }).then(store => { //better way to handle side effects with promise?
            this.internalStore = store;
            return Promise.resolve(this);
        });
    }

    load() {
        return new Promise((fulfill, reject) => {
            this.internalStore.load('text/n3', this.triple, (err, res) => {
                if (err) reject(err);
                else fulfill(this);
            });
        });
    }

    /**
     * import - Imports and validates all nessecary components
     * from a dataCube. (e.g. dataset, dsd ...)
     *
     * @param  {type} dataset description
     * @return {Promise} Returns the promise of a json with all data.
     */
    import(dataset) {

        if (dataset)
            this.result.dataset = dataset;

        const promise = (dataset
            ? this.getDsd(dataset)
            : this.getDatasets()
                .then(ds => {
                    if (ds.length === 0) return Promise.reject(new Error('NO DATASET FOUND VALIDATION ERROR'));
                    this.log(this.constructor.name + ' found ' + ds.length + ' Datasets, selected first.');
                    this.result.dataset = ds[0];
                    return this.getDsd(ds[0]);
                }));
        return promise
        .then(dsd => {
            if (dsd.length === 0) return Promise.reject(new Error('NO DSD FOUND VALIDATION ERROR'));
            this.result.dataStructureDefinition = dsd[0];
            this.log(this.constructor.name + ' found ' + dsd.length + ' DSD, selected first.');
            const p =
                [
                    this.getDimensions(this.result.dataset, dsd[0]),
                    this.getMeasures(this.result.dataset, dsd[0]),
                    this.getAttributes(this.result.dataset, dsd[0]),
                ];
            return Promise.all(p);
        })
        .then(res => {
            if (res[1].length === 0) return Promise.reject(new Error('NO MEASURE FOUND VALIDATION ERROR'));
            if (res[0].length === 0) return Promise.reject(new Error('NO DIMENSIONS FOUND VALIDATION ERROR'));

            this.log(this.constructor.name + ' found ' + res[0].length + ' dimension(s)');
            this.log(this.constructor.name + ' found ' + res[1].length + ' measure(s)');
            this.log(this.constructor.name + ' found ' + res[2].length + ' attribute(s)');

            this.result.dimensions = res[0];
            this.result.measures = res[1];
            this.result.attributes = res[2];

            if (res[2].length === 0) {
                return this.getAttributesFromMeasures(this.result.measures, this.result.dsd, this.result.ds).then(measuresAndAttributes => {
                    //TODO link attr with appropriate measures
                    this.result.attributes = fromJS(measuresAndAttributes[1]).flatten(1).toJS();

                    const dimElPromises = this.result.dimensions.map(dim => this.getDimElements(dim, this.result.dataset));
                    return Promise.all(dimElPromises);
                });
            }

            const dimElPromises = res[0].map(dim => this.getDimElements(dim, this.result.dataset));
            return Promise.all(dimElPromises);
        })
        .then(dimEls => {
            const temp = fromJS(dimEls);

            if (temp.flatten(1).size === 0)
                return Promise.reject(new Error('NO DIMENSION ELEMENTS FOUND VALIDATION ERROR'));

            const tuple = temp.map((dimEl, idx) => [dimEl.size > 0, idx, dimEl]);
            const notEmpty = tuple.filter(t => t[0]).map(t => t[2]);

            // removing dimensions which doesn't containing dimension elements
            const tempDimensions = fromJS(this.result.dimensions).
                filter((dim, idx) => tuple.get(idx)[0]);
            this.result.dimensions = tempDimensions.toJS();

            this.log(
                this.constructor.name + ' found ' + notEmpty.size + ' valid dimension(s) with a total count of ' +
                notEmpty.flatten(1).size + ' dimension element(s)'
            );
            this.result.dimensionElements = this.mapComponentElementsToComponentTypes(notEmpty, this.result.dimensions);

            const attrElPromises = this.result.attributes.map(attr => this.getAttrElements(attr, this.result.dataset));
            return Promise.all(attrElPromises);
        })
        .then(attrEls => {
            if (this.result.attributes.length === 0) {
                this.result.attributesElements = {};
                return this.getObservations(this.result.dataset);
            }

            const temp = fromJS(attrEls);

            if (temp.flatten(1).size === 0)
                return Promise.reject(new Error('NO ATTRIBUTE ELEMENTS FOUND VALIDATION ERROR'));

            this.log(this.constructor.name + ' found ' + temp.flatten(1).size + ' attribute element(s)');
            this.result.attributesElements = this.mapComponentElementsToComponentTypes(temp, this.result.attributes);
            return this.getObservations(this.result.dataset);
        })
        .then(obs => {
            if (obs.length === 0) return Promise.reject(new Error('NO OBSERVATIONS FOUND VALIDATION ERROR'));
            this.result.observations = obs;

            this.log(this.constructor.name + ' found ' + obs.length + ' observation(s)');
            const p = this.result.attributes
                .map(attr => this.getAttrElements(attr, this.result.dataset));
            return Promise.resolve(this.result);
        });
    }

    getAttributesFromMeasures(measures, dsd, ds) {
        const query = (m) => 'CONSTRUCT { ?attr ?p ?o . } WHERE { <' + m + '> <http://purl.org/linked-data/cube#attribute> ?attr . ?attr ?p ?o . }';
        const queries = measures.map(obj => this.execute(query(obj['@id'])).then(this.parse));
        return Promise.all(queries).then(res => {
            return [measures, res];
        });
    }

    getDatasets() {
        return this.execute(this.datasetQuery()).then(this.parse);
    }

    getDsd(dataset) {
        return this.execute(this.dsdQuery(dataset['@id'])).then(this.parse);
    }

    getCs(dsd) {
        return this.execute(this.csQuery(dsd['@id'])).then(this.parse);
    }

    getDimensions(ds, dsd) {
        return this.execute(this.componentQuery(ds['@id'], dsd['@id'], 'http://purl.org/linked-data/cube#dimension'))
            .then(this.parse);
    }

    getMeasures(ds, dsd) {
        return this.execute(this.componentQuery(ds['@id'], dsd['@id'], 'http://purl.org/linked-data/cube#measure'))
            .then(this.parse);
    }

    getAttributes(ds, dsd) {
        return this.execute(this.componentQuery(ds['@id'], dsd['@id'], 'http://purl.org/linked-data/cube#attribute'))
            .then(this.parse);
    }

    getDimElements(dim, dataset) {
        return this.execute(this.componentElementsQuery(dim['@id'], dataset['@id'])).then(this.parse);
    }

    getAttrElements(attr, dataset) {
        return this.execute(this.componentElementsQuery(attr['@id'], dataset['@id'])).then(this.parse);
    }

    getObservations(dataset) {
        return this.execute(this.observationsQuery(dataset['@id'])).then(this.parse);
    }
    getAllTriples() {
        return this.execute(this.allTriplesQuery()).then(this.parse);
    }

    execVerification(ic) {
        return this.execute(ic.query)
            .then(res => {
                const result = (typeof res === 'string') ? (res !== 'false') : res;

                if (result === true) {
                    this.log(ic.name + ': failed 😥');
                    this.log(ic.disc);
                    this.log('See http://www.w3.org/TR/vocab-data-cube/ for further details');
                } else {
                    this.log(ic.name + ': fulfilled 😃');
                    this.log(ic.disc);
                }
            });
    }

    verify() {

        return Promise.all([
            // this.execVerification(Queries.IC1),
            // this.execVerification(Queries.IC2),
            // this.execVerification(Queries.IC3),
            // this.execVerification(Queries.IC4),
            // this.execVerification(Queries.IC6),
            // this.execVerification(Queries.IC11),
            // this.execVerification(Queries.IC12) not possible, not supported rdf store feature
            // this.execVerification(Queries.IC13),
            // this.execVerification(Queries.IC14),
            // this.execVerification(Queries.IC15),
            // this.execVerification(Queries.IC16), // possible rdf store bug
            // this.execVerification(Queries.IC17) not possible, not supported rdf store feature
        ])
        .then(_ => this, e => {
            this.log(e);
            return this;
        });
    }
}

export default SparqlStore;
