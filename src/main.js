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

async attributeToVertex(example, graphName, edgeCollectionName, options) {

  var action = String((args) => {

    var db = require("internal").db;

    var example = args[0]
    var graphName = args[1]
    var edgeCollectionName = args[2]
    var options = args[3]

    if(options.additional_attrs){
      var additional_vertex_attributes = (typeof options.additional_attrs.vertex === "undefined" ? {} : options.additional_attrs.vertex);
      var additional_edge_attributes = (typeof options.additional_attrs.edge === "undefined" ? {} : options.additional_attrs.edge);
    } else {
      var additional_vertex_attributes = {}
      var additional_edge_attributes = {}
    }

    //Because we don't know which collection this vertex is in
    //we pull it using GRAPH_VERTICES
    var matchingVerticesAQL = `
      FOR vertex IN GRAPH_VERTICES(@graph, @example)
        RETURN vertex
    `
    var matchingVertices = db._query(matchingVerticesAQL, {example: example, graph: graphName}).toArray()

    //Declare collection here so we can use it when we create the vertex
    var collection = null
    var verticesWithAttrsRemoved = []
    matchingVertices.forEach(function(vertex){
      //split the id and keep the collection name
      collection = vertex._id.split("/")[0]
      var removeAttributesAQL = `
        REPLACE @vertex WITH UNSET(@vertex, ATTRIBUTES(@example)) IN @@collection
        RETURN NEW
      `
      //All the vertices that have had an attribute removed
      var vertexWithAttrsRemoved = db._query(removeAttributesAQL, {example: example, vertex: vertex, "@collection": collection}).next()
      verticesWithAttrsRemoved.push(vertexWithAttrsRemoved)
    })

    var createVertexAQL = `
    INSERT MERGE(@additional_attrs, @attrs)
    IN @@collection
      RETURN NEW
    `
    var newVertex = db._query(createVertexAQL, {attrs: example, additional_attrs: additional_vertex_attributes, "@collection": collection}).toArray()[0]

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
    var edges = db._query(createEdgesAQL, {verticesWithAttrsRemoved: verticesWithAttrsRemoved, additional_attrs: additional_edge_attributes,  newVertexID: newVertex._id, "@collection": edgeCollectionName}).toArray()

    //In theory all went well.
    return newVertex
  })
  return await this.db.transaction({write: await this.allCollections(graphName)}, action, [example, graphName, edgeCollectionName, options])
};

  async mergeVertices(exampleA, exampleB, graphName) {

    var action = String((args) => {

      var db = require("internal").db;
      var exampleA = args[0]
      var exampleB = args[1]
      var graphName = args[2]
      //Check we have examples to work from
      if(!exampleA) throw new Error(`The first argument to mergeVertices was ${vertexA}`)
      if(!exampleB) throw new Error(`The second argument to mergeVertices was ${vertexB}`)

      //Use exampleA to find a vertex
      var exampleACursor = db._query(`FOR v IN GRAPH_VERTICES(@graph, @example) RETURN v`, {example: exampleA, graph: graphName})
      //If the example matches more than one vertex, that's bad
      if(exampleACursor.count() > 1) throw new Error(`The first example was not specific enough and matched more than one document.`)
      //We now have our vertex to work from
      var vertexA = exampleACursor.toArray()[0]

      //Use exampleA to find a vertex
      var exampleBCursor = db._query(`FOR v IN GRAPH_VERTICES(@graph, @example) RETURN v`, {example: exampleB, graph: graphName})
      //If the example matches more than one vertex, that's bad
      if(exampleBCursor.count() > 1) throw new Error(`The second example was not specific enough and matched more than one document.`)
      var vertexB = exampleBCursor.toArray()[0]

      //We now need the edges for vertexA so we can redirect them to B
      var getEdgesAQL = `
          FOR edge IN GRAPH_EDGES(@graph, @vertex, {includeData: true})
            RETURN edge
      `
      var vertexAedgesCursor = db._query(getEdgesAQL, {graph: graphName, vertex: vertexA})

      //Iterate over A's edges
      //making a new one pointing to/from B
      //and then deleting the current edge
      while(vertexAedgesCursor.hasNext()){
        var edge = vertexAedgesCursor.next()
        //This is gross but it's the easiest way to clone an object...
        var edgeWithoutIDs = JSON.parse(JSON.stringify(edge))
        var collection = edge._id.split('/')[0]
        //pick off Arango's internal attributes
        delete edgeWithoutIDs._id
        delete edgeWithoutIDs._rev
        delete edgeWithoutIDs._key

        //Change the to/from to point to B
        if(edge._to == vertexA._id) {
          edgeWithoutIDs._to = vertexB._id
        }
        if(edge._from == vertexA._id) {
          edgeWithoutIDs._from = vertexB._id
        }

        var upsertEdgeAQL = `
         INSERT @edge IN @@collection RETURN NEW
        `
        var newEdge = db._query(upsertEdgeAQL, {edge: edgeWithoutIDs, '@collection': collection}).toArray()[0]

        db._query(`REMOVE @edge IN @@collection`, {edge: edge, '@collection': collection})
      }

      //Merge A onto B
      var vertexBCollection = vertexB._id.split('/')[0]
      var mergeAQL = `UPDATE @vertexB WITH MERGE(@vertexA, @vertexB) IN @@collection RETURN NEW`
      var merged = db._query(mergeAQL, {vertexA: vertexA, vertexB: vertexB, '@collection': vertexBCollection}).toArray()[0]

      //Remove vertexA
      var vertexBCollection = vertexA._id.split('/')[0]
      db._query(`REMOVE @vertex IN @@collection`, {vertex: vertexA, '@collection': vertexBCollection})
      return merged
    })

    return await this.db.transaction({write: await this.allCollections(graphName)}, action, [exampleA, exampleB, graphName])
  }

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

