'use strict';
import "babel-polyfill"

import arangojs, {Database, aqlQuery} from 'arangojs';

export default class GraphMigration {

  constructor(databaseName, url="http://localhost:8529") {
    if(typeof databaseName == 'undefined') throw new Error('You must provide a database name')
    this.db = arangojs({databaseName, url})
  }

  databaseName() {
    return this.db.name
  }

  async _describeGraph(graphName) {
    let graph = await this.db.graph(graphName)
    return await graph.get()
  }

  async allCollections(graphName) {
    let collections = []
    let graphDescription = await this._describeGraph(graphName)
    graphDescription.edgeDefinitions.forEach((edgeDef) => {
      collections.push(edgeDef.collection)
      //XXX: this means we are not allowing edge collections that point to
      //more than one document collection
      collections.push(edgeDef.to[0])
      collections.push(edgeDef.from[0])
    })
    return Array.from(new Set(collections))
  }

  async redirectEdges(start, target, graphName, options) {

  var action = String((args) => {

    var db = require("internal").db;
    var graph_module = require("@arangodb/general-graph")
    //TODO: make sure these are the types we think
    var source = args[0]
    var destination = args[1]
    var graphName = args[2]
    var options = args[3]
    options.edge_example = (typeof options.edge_example === 'undefined') ? {} : options.edge_example;

    var resultset = []

      //Our neighbor is the new target for these edges
      if(options.direction == "inbound"){
        //GRAPH_* functions let us get things from the graph without
        //knowledge of the collection they live in.
        //But there is no way to find and reference the collection a
        //document is from if all you have is the document itself.
        //So first we get the edges:
        var inboundEdgesAQL = `
        FOR edge IN GRAPH_EDGES(@graph, @src, {includeData: true, direction: "inbound"})
        FILTER edge._to != @dst._id || edge._from != @dst._id
          RETURN edge
        `
        var inboundEdges = db._query(inboundEdgesAQL, {graph: graphName, src: source, dst: destination}).toArray()

        //With edges in hand we split the collection name out of the id:
        inboundEdges.forEach(function(edge){
          var collection = edge._id.split("/")[0]
          //delete the existing edge
          var removeInboundEdgeAQL = `
             REMOVE @edge IN @@collection
          `
          db._query(removeInboundEdgeAQL, {edge: edge, "@collection": collection}).toArray()[0]
          //And then edit the edge in it's collection like a regular document:
          var createInboundEdgeAQL = `
          INSERT @edge IN @@collection RETURN NEW
         `
          edge._to = destination._id
          delete edge._id
          delete edge._key
          delete edge._rev
          var opt = {edge: edge, "@collection": collection}

          var attributes = db._query(createInboundEdgeAQL, opt).toArray()[0]

        })

        resultset.push(destination)

      }

      if(options.direction == "outbound"){
        var outboundEdgesAQL = `
        FOR edge IN GRAPH_EDGES(@graph, @src, {includeData: true, direction: "outbound"})
        FILTER edge._to != @dst._id || edge._from != @dst._id
          RETURN edge
        `
        var outboundEdges = db._query(outboundEdgesAQL, {graph: graphName, src: source, dst: destination}).toArray()

        //With edges in hand we split the collection name out of the id:
        outboundEdges.forEach(function(edge){
          var collection = edge._id.split("/")[0]
          //delete the existing edge
          var removeOutboundEdgeAQL = `
             REMOVE @edge IN @@collection
          `
          db._query(removeOutboundEdgeAQL, {edge: edge, "@collection": collection}).toArray()[0]
          //And then edit the edge in it's collection like a regular document:
          var createOutboundEdgeAQL = `
          INSERT @edge IN @@collection RETURN NEW
         `
          edge._from = destination._id
          delete edge._id
          delete edge._key
          delete edge._rev
          var opt = {edge: edge, "@collection": collection}

          var attributes = db._query(createOutboundEdgeAQL, opt).toArray()[0]

        })

        resultset.push(destination)

      }


    return resultset
  })

  return await this.db.transaction({write: await this.allCollections(graphName)}, action, [start, target, graphName, options])
}

async vertexToAttribute(example, graphName, options) {

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
    //delete each of the edges
    //XXX: Will need to consider a way to rescue data from these edges
    edges.forEach(function(edge) {
      var collection = edge._id.split('/')[0]
      db._query(`REMOVE @key IN @@collection`, {key: edge._key, "@collection": collection}).toArray()
    })

    //attach startingVertex attrs to each of the neighboring vertices
    var newNeighbors = []
    neighbors.forEach(function(vertex) {
      var collection = vertex._id.split('/')[0]
      //XXX: Here we are using the order of the arguments to MERGE to
      //handle duplicate attributes by strategically clobbering them
      //with the existing attributes. Revisit this.
      var mergeQuery = `
        UPDATE @example WITH MERGE(@vertexAttrs, @example) IN @@collection RETURN NEW
      `
      var newNeighbor = db._query(mergeQuery, {example: vertex, vertexAttrs: startingVertex, "@collection": collection}).toArray()[0]
      newNeighbors.push(newNeighbor)
    })

    //delete the startingVertex
    db._query(`REMOVE @key IN @@collection`, {key: startingVertex._key, "@collection": startingVertex._id.split("/")[0]}).toArray()

    return newNeighbors
  })

  return await this.db.transaction({write: await this.allCollections(graphName)}, action, [example, graphName, options])
}

async attributeToVertex(example, graphName, options) {

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
    //XXX: hardcoding collection names
    var verticesWithAttrsRemoved = db._query(removeAttributesAQL, {example: example, "@collection": "vertices"}).toArray()

    var createVertexAQL = `
    INSERT MERGE(@additional_attrs, @attrs)
    IN @@collection
      RETURN NEW
    `
    //XXX: hardcoding collection names
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
    //XXX: hardcoding collection names
    var edges = db._query(createEdgesAQL, {verticesWithAttrsRemoved: verticesWithAttrsRemoved, additional_attrs: additional_edge_attributes,  newVertexID: newVertex._id, "@collection": 'edges'}).toArray()

    //In theory all went well.
    return newVertex
  })
  return await this.db.transaction({write: await this.allCollections(graphName)}, action, [example, graphName, options])
};

}

// TODO: Revisit this but use graphs instead of collections.
// let removeAttribute = async (example, collection) => {
//   //Then remove the attribute from existing vertices
//   //FIXME: use the collection variable
//   let aql = aqlQuery`
//     FOR vertex IN vertices
//       FILTER MATCHES(vertex, ${example})
//         REPLACE vertex WITH UNSET(vertex, ATTRIBUTES(${example})) IN vertices
//           RETURN NEW
//   `
//   let cursor = await db.query(aql)
//   return cursor.all()
// }

