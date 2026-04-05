export interface SparqlBinding {
    [key: string]: { type: string; value: string };
}

export async function fetchSparql(query: string, endpoint: string): Promise<SparqlBinding[]> {
    console.log("[SPARQL] Querying SPARQL endpoint...");

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded", 
            "Accept": "application/sparql-results+json" },
        body: `query=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
        throw new Error(`SPARQL endpoint error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.results.bindings as SparqlBinding[];
}

