# Semantic SPARQL Queries

This document provides example SPARQL queries that leverage the semantic links between Terraces, Restaurants, and Events in the Sun-Seeker dataset.

## 1. Events at a sunny terrace of an Italian Restaurant
This query finds all events taking place at a terrace linked to a restaurant that serves Italian cuisine, filtered by sun intensity.

```sparql
PREFIX schema: <https://schema.org/>
PREFIX zt: <http://api.sun-seeker.be/vocab#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?eventTitle ?terrasName ?restaurantName ?intensity WHERE {
  # 1. Start from the event
  ?event a schema:Event ;
         schema:name ?eventTitle ;
         schema:location ?terras .
  
  # 2. Link to the terrace
  ?terras a zt:Terras ;
          schema:name ?terrasName ;
          zt:sunIntensity ?intensity .
  
  # 3. Link to the restaurant (if defined in OSM or internal zt:belongsTo)
  # Note: If linked via osmUri, we can federate with OSM tags
  ?terras owl:sameAs ?osmTerras .
  
  # Example: Filter for intensity > 80
  FILTER(?intensity > 80)
}
```

## 2. Find all events happening today at a specific location
```sparql
PREFIX schema: <https://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?title ?startDate WHERE {
  ?event a schema:Event ;
         schema:name ?title ;
         schema:startDate ?startDate .
  
  # Filter for a specific day (e.g., 2024-05-20)
  FILTER(CONTAINS(STR(?startDate), "2024-05-20"))
}
ORDER BY ?startDate
```

## 3. High-rated Restaurants with their Terrace sun intensity
```sparql
PREFIX schema: <https://schema.org/>
PREFIX zt: <http://api.sun-seeker.be/vocab#>

SELECT ?restaurantName ?rating ?intensity WHERE {
  ?restaurant a schema:Restaurant ;
              schema:name ?restaurantName ;
              schema:aggregateRating ?rating .
  
  # If we have the zt:hasTerras link implemented
  ?restaurant zt:hasTerras ?terras .
  ?terras zt:sunIntensity ?intensity .

  FILTER(?rating > 4.0)
}
ORDER BY DESC(?intensity)
```

## 4. Federated Query: Internal Events + OSM Wheelchair Access
This query combines our internal event data with OSM's accessibility tags.

```sparql
PREFIX schema: <https://schema.org/>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>

SELECT ?eventTitle ?address ?wheelchair WHERE {
  ?event a schema:Event ;
         schema:name ?eventTitle ;
         schema:location ?terras .
  
  ?terras owl:sameAs ?osmUri ;
          schema:address ?address .

  # Fetch additional tags from the OSM graph
  ?osmUri osmkey:wheelchair ?wheelchair .
  
  FILTER(?wheelchair = "yes")
}
```
