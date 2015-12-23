# Graph Migrations

I've been using [ArangoDB](https://www.arangodb.com) for a couple of
years now. So far the only thing I miss after moving away from a
relational database is the migrations that Rails provides.

The code here is just thinking out loud, its not intended for use.
What's being explored is common modifications to existing graphs.

Examples:
* Moving the attributes on a hub vertex onto all the vertices its connected to.
* Taking an attribute from multiple vertices and making a hub out of it.
* Reversing the direction of relationships
* Adding intermediary vertices based on edge attributes
* Adding/removing indexes
* Automatically dividing edges among edge collections
* Executing these things in order and tracking which ones have run

There are definitely others.
Probably most of these make sense as one or more Foxx applications, and
for that reason this is being written in Javascript, but for ease of
exploration its currently an node module.

Ideas and pull requests welcome.
