'use strict';

import 'babel/polyfill'
import vertexData from './data/vertices'
import edgeData from './data/edges'
import assert from 'assert';
import arangojs, {Database, aqlQuery} from 'arangojs';
import {
  attributeToVertex,
  vertexToAttribute,
  createVertex,
  removeAttribute,
  redirectEdges,
  allCollections
} from '../src/main'

describe('Test setup', () => {

  let db = arangojs({databaseName: "test", url: "http://localhost:8529"})

  beforeEach(async () => {
    let vertexCollection = await db.collection('vertices')
    let edgesCollection = await db.edgeCollection('edges')
    try {
      await vertexCollection.create()
      await edgesCollection.create()
    }
    catch (e) {
      // The collection exists already
    }
    // import the test data
    await vertexCollection.import(vertexData);
    await edgesCollection.import(edgeData)
  })

  it('can query the test data', async () => {
    //There are 23 vertices in test/data/vertices.js
    let aql = aqlQuery`
      RETURN LENGTH(vertices)
    `
    let cursor = await db.query(aql)
    let results = await cursor.all()
    assert.equal(23, results[0]);
  });

  afterEach(() => db.truncate())

  let vertexLike = async (example) => {
    let aql = aqlQuery`
      FOR v IN vertices FILTER MATCHES(v, ${example}) RETURN v
    `
    let cursor = await db.query(aql)
    return cursor.all()
  }

  it('can reify an attribute with and inbound edge', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, "test", {direction: "inbound"})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN INBOUND ${newVertex[0]} GRAPH "test" RETURN v`
    let result = await db.query(aql)
    let reachableVertex = await result.next()
    assert.equal("Shopify", reachableVertex.name)
  })

  it('can reify an attribute with and outbound edge', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, "test", {direction: "outbound", additional_attrs: {vertex: {}, edge: {}}})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN OUTBOUND ${newVertex[0]} GRAPH "test" RETURN v`
    let result = await db.query(aql)
    let reachableVertex = await result.next()
    assert.equal("Shopify", reachableVertex.name)
  })

  it('can reify an attribute and add additional attributes to the outbound edge', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, "test", {direction: "outbound", additional_attrs: {vertex: {}, edge: {foo: "bar"}}})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN OUTBOUND ${newVertex[0]} GRAPH "test" RETURN e`
    let result = await db.query(aql)
    let edge = await result.next()
    assert.equal("bar", edge.foo)
  })

  it('can reify an attribute and add additional attributes to the inbound edge', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, "test", {direction: "inbound", additional_attrs: {vertex: {}, edge: {foo: "bar"}}})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN INBOUND ${newVertex[0]} GRAPH "test" RETURN e`
    let result = await db.query(aql)
    let edge = await result.next()
    assert.equal("bar", edge.foo)
  })

  it('can reify an attribute and add additional attributes to the vertex', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, "test", {direction: "inbound", additional_attrs: {vertex: {foo: "bar"}, edge: {}}})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    assert.equal("bar", newVertex[0].foo)
  })


  it('does not explode when additional_attrs is not present', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, "test", {direction: "inbound"})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN INBOUND ${newVertex[0]} GRAPH "test" RETURN v`
    let result = await db.query(aql)
    let reachableVertex = await result.next()
    assert.equal("Shopify", reachableVertex.name)
  })

  describe("createVertex", () => {
    it("creates a vertex in the specified collection", async () => {
      let vertex = await createVertex({foo: "bar"}, "vertices")
      assert.equal("bar", vertex[0].foo)
      assert.notEqual(null, vertex[0]._id)
    })
  })

  describe("removeAttribute", () => {
    it("creates a vertex in the specified collection", async () => {
      let vertexWith = await createVertex({foo: "bar"}, "vertices")
      let vertexWithout = await removeAttribute({foo: "bar"}, "vertices")
      assert.equal(vertexWith[0]._id, vertexWithout[0]._id)
      assert.equal("bar", vertexWith[0].foo)
      assert.equal(null, vertexWithout[0].foo)
    })
  })

  describe('vertexToAttribute', () => {

    it('takes a vertex id', async () => {

      let vertices = await vertexToAttribute({name: "mysql"}, "test", {direction: "inbound"})
      assert.equal(4, vertices.length)
      assert.equal("mysql", vertices[0].name)
      assert.equal("office", vertices[0].type)
    })

  })

  describe('allCollections', () => {

    it('returns and array of all the collections associated with the specified graph', async () => {

      let collections = await allCollections("test")
      assert.deepEqual(['edges', 'vertices'], collections)
    })

  })

  describe('redirectEdges', () => {

    let getEdgesFor = async (example, direction, edgeExample) => {
      if(typeof edgeExample == 'undefined') {
	var getEdgesAQL = aqlQuery`FOR edge IN GRAPH_EDGES("test", ${example}, {includeData: true, direction: ${direction}}) RETURN edge`
      } else {
	var getEdgesAQL = aqlQuery`FOR edge IN GRAPH_EDGES("test", ${example}, {includeData: true, direction: ${direction}, edgeExamples: [${edgeExample}]}) RETURN edge`
      }
      let cursor = await db.query(getEdgesAQL)
      return await cursor.all()
    }

    it('accepts a starting example and target', async () => {
      //scoop up Shopify and it's york office
      let shopifyAQL = aqlQuery`FOR vertex IN GRAPH_SHORTEST_PATH("test", {name: "Shopify"}, {address: "126 York Street, Ottawa, ON K1N, Canada"},{includeData: true})[*].vertices RETURN vertex`
      let result = await db.query(shopifyAQL)
      let results = await result.all()
      let shopify = results[0][0]
      let shopify_york_office = results[0][1]

      let york_office_edges_before = await getEdgesFor(shopify_york_office, "outbound", {type: "uses"})
      let shopify_edges_before = await getEdgesFor(shopify, "outbound", {type: "uses"})

      //Redirect the "uses" type edges from the office to shopify
      let vertices = await redirectEdges(shopify_york_office, shopify, "test", {direction: "outbound", example: {type: "uses"}})

      let york_office_edges_after = await getEdgesFor(shopify_york_office, "outbound", {type: "uses"})
      let shopify_edges_after = await getEdgesFor(shopify, "outbound", {type: "uses"})
      assert.equal(7, york_office_edges_before.length)
      assert.equal(0, shopify_edges_before.length)
      assert.equal(0, york_office_edges_after.length)
      assert.equal(7, shopify_edges_after.length)
    })

  })

});

