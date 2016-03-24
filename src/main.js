'use strict';

import arangojs, {Database, aqlQuery} from 'arangojs';

let db = arangojs({databaseName: "test", url: "http://localhost:8529"})

let createVertex = async (attrs, collection) => {
  //FIXME: use the collection variable
  //insert a new vertex for the attribute
  let insertionQuery = aqlQuery`
    UPSERT ${attrs}
      INSERT ${attrs}
      UPDATE {}
      IN vertices
        RETURN NEW
  `
  let insertionCursor = await db.query(insertionQuery)
  return insertionCursor.all()
}

module.exports.createVertex = createVertex;

let removeAttribute = async (example, collection) => {
  //Then remove the attribute from existing vertices
  //FIXME: use the collection variable
  let aql = aqlQuery`
    FOR vertex IN vertices
      FILTER MATCHES(vertex, ${example})
        REPLACE vertex WITH UNSET(vertex, ATTRIBUTES(${example})) IN vertices
          RETURN NEW
  `
  let cursor = await db.query(aql)
  return cursor.all()
}

module.exports.removeAttribute = removeAttribute;

let attributeToVertex = async (example, graphName, options) => {

  var action = String((args) => {

    var db = require("internal").db;

    var example = args[0]
    var graphName = args[1]
    var options = args[2]

    if(options.additional_attrs){
      var additional_vertex_attributes = options.additional_attrs.vertex
      var additional_edge_attributes = options.additional_attrs.edge
    } else {
      var additional_vertex_attributes = {}
      var additional_edge_attributes = {}
    }

    var removeAttributesAQL = `
      FOR vertex IN vertices
      FILTER MATCHES(vertex, @example)
      REPLACE vertex WITH UNSET(vertex, ATTRIBUTES(@example)) IN @@collection
      RETURN NEW
    `
    //All the vertices that have had an attribute removed
    var verticesWithAttrsRemoved = db._query(removeAttributesAQL, {example: example, "@collection": "vertices"}).toArray()

    var createVertexAQL = `
    INSERT MERGE(@attrs, @additional_attrs)
    IN @@collection
      RETURN NEW
    `
    var newVertex = db._query(createVertexAQL, {attrs: example, additional_attrs: additional_vertex_attributes, "@collection": "vertices"}).toArray()[0]

    //verticesWithAttrsRemoved is an array of all the documents we removed the
    //attribute from.
    //Now we create edges either to or from all the vertices we removed
    //the attribute from to the newly created vertex
    if(options.direction == "inbound") {
      var createEdgesAQL = `
      FOR vertex IN @verticesWithAttrsRemoved
        LET merged = (MERGE({ _to: @newVertexID, _from: vertex._id }, @additional_attrs))
        INSERT merged
        IN @@collection
          RETURN NEW
      `
    } else {
      var createEdgesAQL = `
      FOR vertex IN @verticesWithAttrsRemoved
        LET merged = (MERGE({ _from: @newVertexID, _to: vertex._id }, @additional_attrs))
        INSERT merged
        IN @@collection
          RETURN NEW
      `
    }
    var edges = db._query(createEdgesAQL, {verticesWithAttrsRemoved: verticesWithAttrsRemoved, additional_attrs: additional_edge_attributes,  newVertexID: newVertex._id, "@collection": 'edges'}).toArray()

    //In theory all went well.
    return newVertex
  })
  return await db.transaction({write: await allCollections(graphName)}, action, [example, graphName, options])
};

module.exports.attributeToVertex = attributeToVertex;

let describeGraph = async (graphName) => {
  let graph = await db.graph(graphName)
  return await graph.get()
}

export async function allCollections(graphName) {
  let collections = []
  let graphDescription = await describeGraph(graphName)
  graphDescription.edgeDefinitions.forEach((edgeDef) => {
    collections.push(edgeDef.collection)
    //XXX: this means we are not allowing edge collections that point to
    //more than one document collection
    collections.push(edgeDef.to[0])
    collections.push(edgeDef.from[0])
  })
  return Array.from(new Set(collections))
}


export async function vertexToAttribute(example, graphName, options) {

  var action = String((args) => {

    var db = require("internal").db;
    var graph_module = require("@arangodb/general-graph")

    var example = args[0]
    var graphName = args[1]
    var options = args[2]
    var aql = `RETURN GRAPH_VERTICES(@graph, @example)`
    var matches = db._query(aql, {graph: graphName, example: example}).toArray()[0]

    if(matches.length > 1) {
      throw new Error('Example matched more than a single vertex.')
    }

    var startingVertex = matches[0]
    var neighborsQuery = `RETURN GRAPH_NEIGHBORS(@graph, @startingVertex, {includeData: true, direction: @direction})`
    var neighbors = db._query(neighborsQuery, {graph: graphName, startingVertex, direction: options.direction}).toArray()[0]

    var edgesQuery = `RETURN GRAPH_EDGES(@graph, @startingVertex, {includeData: true, direction: @direction})`
    var edges = db._query(edgesQuery, {graph: graphName, startingVertex, direction: options.direction}).toArray()[0]

    //attach startingVertex attrs to each of the neighboring vertices
    var newNeighbors = []
    neighbors.forEach(function(vertex) {
      var collection = vertex._id.split('/')[0]
      //XXX: Here we are using the order of the arguments to MERGE to
      //handle duplicate attributes by strategically clobbering them
      //with the existing attributes. Revisit this.
      var mergeQuery = `
        REPLACE @example WITH MERGE(@vertexAttrs, @example) IN @@collection RETURN NEW
      `
      var newNeighbor = db._query(mergeQuery, {example: vertex, vertexAttrs: startingVertex, "@collection": collection}).toArray()[0]
      newNeighbors.push(newNeighbor)
    })

    //delete the startingVertex
    db._query(`REMOVE @key IN @@collection`, {key: startingVertex._key, "@collection": startingVertex._id.split("/")[0]}).toArray()
    //finally delete each of the edges
    //XXX: Will need to consider a way to rescue data from these edges
    edges.forEach(function(edge) {
      var collection = edge._id.split('/')[0]
      db._query(`REMOVE @key IN @@collection`, {key: edge._key, "@collection": collection}).toArray()
    })

    return newNeighbors
  })

  return await db.transaction({write: await allCollections(graphName)}, action, [example, graphName, options])
};
