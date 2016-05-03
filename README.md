# Graph Migrations

I've been using [ArangoDB](https://www.arangodb.com) for a couple of
years now. So far the only thing I miss after moving away from a
relational database is the migrations that Rails provides.

The code here is just thinking out loud, its not intended for use.
What's being explored here are common modifications to existing graphs.

Examples:
* Moving the attributes on a hub vertex onto all the vertices its connected to.
* Taking an attribute from multiple vertices and making a hub out of it.
* Reversing the direction of relationships
* Adding intermediary vertices based on edge attributes
* Adding/removing indexes
* Automatically dividing edges among edge collections
* Executing these things in order and tracking which ones have run

There are definitely others.

Probably most of these make sense as one or more Foxx applications, or
maybe some custom AQL functions. It's not clear yet, but for ease of
exploration its currently an node module.

## What works

### vertexToAttribute

This is aimed at getting rid of hubs (high degree vertices) in your data set.
The best way to show this is with some test data:

```javascript
//Our vertices
[
  {
    "foo" : "bar",
    "_id" : "vertices/4464345735885",
    "_rev" : "4464345735885",
    "_key" : "4464345735885"
  },
  {
    "baz" : "quxx",
    "_id" : "vertices/4464237339341",
    "_rev" : "4464345408205",
    "_key" : "4464237339341"
  },
  {
    "fizz" : "buzz",
    "_id" : "vertices/4464235307725",
    "_rev" : "4464345604813",
    "_key" : "4464235307725"
  }
]
//Edges
[
  {
    "_id" : "edges/4464345866957",
    "_rev" : "4464345866957",
    "_key" : "4464345866957",
    "_from" : "vertices/4464237339341",
    "_to" : "vertices/4464345735885"
  },
  {
    "_id" : "edges/4464345998029",
    "_rev" : "4464345998029",
    "_key" : "4464345998029",
    "_from" : "vertices/4464235307725",
    "_to" : "vertices/4464345735885"
  }
]
```
This data gives us a the following graph:

![Test data with a hub](https://mikewilliamson.files.wordpress.com/2016/04/hub_example.png)

If we decide that `foo: "bar"` doesn't make sense as a vertex on it's own we can demote it to be an attribute on the connected vertices.

```javascript
> GraphMigration = require('./dist/main').default
[Function: GraphMigration]
> gm = new GraphMigration("test")
gm.vertexToAttribute({foo: "bar"}, "test", {direction: "inbound"}).then(function(){ console.log("done") })
```

The result is this:

```javascript
//vertices
[
  {
    "foo" : "bar",
    "baz" : "quxx",
    "_id" : "vertices/4464237339341",
    "_rev" : "4464316441293",
    "_key" : "4464237339341"
  },
  {
    "foo" : "bar",
    "fizz" : "buzz",
    "_id" : "vertices/4464235307725",
    "_rev" : "4464316310221",
    "_key" : "4464235307725"
  }
]
//edges
[]
```

### attributeToVertex

This function would essentially put us back to where we started, by moving
`foo: "bar"` back into a vertex and creating edges from the vertices it came
from.

```javascript
//arguments: example, graph name, edge Collection to save in, options
gm.attributeToVertex({foo: "bar"}, "test", "edges", {direction: "inbound"}).then(function(){ console.log("done") })
```

Since we are creating vertices and edges, it would also be nice to
be able to add extra attributes to be added. You can do that with the
additional_attrs option:

```javascript
gm.attributeToVertex({foo: "bar"}, "test", "edges", {direction: "inbound", additional_attrs: {vertex: {asdf: "qwerty"}, edge: {type: "useless"}}}).then(function(){ console.log("done") })
```

### redirectEdges

This function requires that you be specific with the start and end vertices. Make sure you pass in something with and `_id`attribute.

```javascript
gm.redirectEdges({"baz" : "quxx", "_id" : "vertices/4464237339341"}, {"fizz": "buzz", "_id" : "vertices/4464235307725"}, "test", {direction: "inbound"})
```
If you have edges pointing somewhere and want them pointing somewhere
else, this is the function that does it.

### mergeVertices

Given two vertex examples, this function merges the first onto the second. This implies that where both vertices have an attribute with different values, the value from the first vertex will survive the merge.

```javascript
gm.mergeVertices({"address" : "11305 4 Points Drive #300, Austin, TX 78726, USA"}, {"address" : "11305 4 Points Dr, Austin, TX 78726, USA"}, "test").then(function(){ console.log("done") })
```

Any edges that were pointing to the first vertex will now point to the
second.

### eagerDelete

Deleting vertices can sometimes leave some orphan vertices lying around.
If we want to delete Bob from the following graph, Dave and Charlie
would have nothing to connect them to the graph.

![eagerDelete](https://mikewilliamson.files.wordpress.com/2016/04/screenshot-from-2016-04-06-10-55-54.png)

`eagerDelete` lets you specify a vertex to be deleted and checks it's neighbors to see if they
will be orphaned by the deletion. If so, it deletes them too.

```javascript
gm.eagerDelete({name: "Bob"}, "knows_graph")
```

## Misc

Often graph data comes in two big buckets: vertices and edges. Arango
gets some speed and efficiency out of splitting these two (normally
huge) collections into a bunch of smaller ones. The following functions
are aimed at helping with that.

### splitDocumentCollection

This function splits a collection based on an attribute. Assuming a
document collection where each document has a type attribute (type:
"author" or type: "book"), and a graph called test that includes this
collection, we could split on the type like this:

```
gm.splitDocumentCollection('type', 'vertices', 'test')
```
The result would be the creation of collections called "author" and
"book" with all the documents where `"type": "author"` being moved into
the author collection and documents with `type: "book"` moved to the
book collection.

The important thing to note is that this function uses the graph ('test'
above) to determine what edges are referencing this document and updates
them to reference the document in it's new collection.

### splitEdgeCollection

This is basically the same idea, given an attribute, create collections
for each of the values and move the edge into the appropriate
collection.

```
gm.splitEdgeCollection('type', 'edges')
```

If you have a graph of two collections (say vertices and edges) and you
want to split both, do the documents first.

## TODO

* Flip edge function

This is all highly experimental.
Ideas and pull requests welcome.
