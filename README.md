# RESTful Audiobooks Web API

This project implements a RESTful web API for managing an audiobooks library, supporting both HTML views for browsers and JSON representations for machines. It follows REST principles using Node.js with an MVC framework like Express or Fastify, MongoDB for data storage, and deployment on Ubuntu with NGINX and HTTPS.[^1][^2]

## Project Goals

Design and build a web API treating audiobooks, users, genres, ratings, and playback positions as resources identifiable by URLs. Support content negotiation for HTML/JSON representations, stateless HTTP methods (GET, POST, PUT, DELETE, PATCH), and hypermedia controls for navigation. No authentication required; assume public access with user fields in forms for simulation.[^3][^1]

## Data Model

Required entities and fields:


| Entity | Fields |
| :-- | :-- |
| User | name (string, required, non-empty), email (string, valid format) |
| Genre | name (string), description (text) |
| Audiobook | name (string, required), authors (array), genres (array of genre refs), description (text), publication date (date), purchase link (URL), duration (milliseconds, number) |
| Rating | user (ref), audiobook (ref), description (text), score (number) |
| Playback Position | user (ref), audiobook (ref), position (milliseconds, number) |

User profiles list currently listening and completed audiobooks. Ratings require partial playback. Deleting audiobooks hides them publicly but preserves data; others delete fully with cascade updates (e.g., genre refs).[^4]

## Tech Stack

- Node.js with MVC framework (Express, Fastify, Koa, NestJS, Hono, etc.)
- MongoDB (self-hosted instance)
- Templating for HTML views (group in subfolders)
- Native Promises/async-await (no async library)
- Routes in separate files (like models/controllers)
- External JS via package.json/node_modules (no CDNs)
- HTTP methods: GET (read), POST (create/action), PUT (full replace), PATCH (partial), DELETE (remove)

Avoid code duplication; use debuggers in WebStorm/VS Code.[^5][^6]

## Installation

1. Install Node.js and npm on Ubuntu server.
2. Clone repo, run `npm install`.
3. Set up MongoDB: start service, create database.
4. Configure app for local MongoDB (not cloud).
5. Install NGINX: `sudo apt install nginx`.
6. Obtain Let's Encrypt SSL: `sudo certbot --nginx -d your-hostname.webdev.stud.atlantis.UGent.be` (request early due to weekly limits).[^7]
7. Configure NGINX for HTTPS redirect, root app proxy, static cache (/assets, 1 hour), 404 for wrong hosts.
8. Use PM2/systemd for auto-start: e.g., `pm2 start app.js --name audiobooks`.
9. Restore sample DB: `mongorestore dump/`.

Server example: 157.193.171.61 (change password immediately; use sudo responsibly).[^8][^9]

## Usage

- Access via HTTPS on assigned hostname (e.g., https://groep01.webdev.stud.atlantis.UGent.be).
- HTML: Browser default.
- JSON: `curl -H "Accept: application/json" https://.../audiobooks/123`.
- CRUD examples:

```
GET /audiobooks → list audiobooks
POST /audiobooks → add new (body: JSON with fields)
GET /users/stefan → profile with listening/completed lists
DELETE /audiobooks/123 → hide publicly
POST /audiobooks/123/ratings → add rating (requires position >0)
```


Hypermedia links in responses (e.g., "related" array in JSON). Validate all inputs.[^2][^1]

## Example Representations

**HTML (weather analogy, adapt for audiobooks):**

```html
<div id="main">
  <h1>Audiobook: Example Title</h1>
  <dl>
    <dt>Duration</dt><dd>3600000ms</dd>
    <dt>Genres</dt><dd>Sci-Fi</dd>
  </dl>
  <a href="/audiobooks/123/ratings">Add Rating</a>
</div>
```

**JSON:**

```json
{
  "audiobook": {
    "title": "Example",
    "duration": 3600000
  },
  "related": [{
    "title": "Add Rating",
    "href": "/audiobooks/123/ratings",
    "method": "POST"
  }]
}
```

Test with curl for content negotiation.[^2]

## File Structure

```
project-root/
├── package.json
├── controllers/     # HTTP method handlers
├── models/          # Mongoose schemas (User, Audiobook, etc.)
├── routes/          # Route definitions (e.g., audiobooks.js)
├── views/           # Templates (subfolders: users/, audiobooks/)
│   └── partials/
├── public/          # Static assets (/assets)
├── .git/            # >20 commits
├── dump/            # mongodump of sample DB
└── README.md
```

No node_modules in submission.[^6]

## Deployment Notes

- NGINX: Proxy to Node (e.g., port 3000), HTTPS only, HTTP→HTTPS 301.
- Static cache: `expires 1h;` for /assets/.
- Firewall: Avoid blocking SSH (22); no public unsafe services.
- Auto-start app on boot.


## Submission

Zip: full project (no node_modules), .git, mongodump of filled DB. Submit to Ufora by March 14, 2025, 23:59. Private GitHub.ugent.be repo.[^8]

## Evaluation Criteria

- Data modeling/validation
- HTML reps (REST conformance)
- JSON reps (complete, negotiation, REST)
- Server: Node/NGINX/SSL setup
- General: Executable, commits, structure


## Authors / Contributors

Student group at UGent Webdevelopment (2025-2026). Feedback to Ruben Verborgh.[^3]

## License

CC BY 4.0 (slides/course materials).[^3]
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^20][^21][^22][^23][^24][^25][^26][^27][^28][^29][^30]</span>

<div align="center">⁂</div>

[^1]: https://restfulapi.net

[^2]: https://www.lonti.com/blog/the-key-ingredients-of-restful-apis-resources-representations-and-statelessness

[^3]: https://github.com/RubenVerborgh/WebFundamentals

[^4]: https://forums.meteor.com/t/mongo-schema-for-read-books-and-followers/36623

[^5]: https://betterstack.com/community/guides/scaling-nodejs/fastify-express/

[^6]: https://www.sohamkamani.com/nodejs/mongodb-express-rest-api/

[^7]: https://serverspace.io/support/help/how-to-get-lets-encrypt-ssl-on-ubuntu/

[^8]: https://www.bmc.com/blogs/mongodb-mongorestore/

[^9]: https://gist.github.com/RajeshReddyM/6533704

[^10]: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design

[^11]: https://www.thoughtworks.com/insights/blog/rest-api-design-resource-modeling

[^12]: https://apisyouwonthate.com/blog/understanding-resources-and-collections-in-restful-apis/

[^13]: https://audiobookfest.com/free-audiobooks-api-top-options-integration-guide-and-use-cases/

[^14]: https://symfonycasts.com/screencast/rest/rest

[^15]: https://www.reddit.com/r/node/comments/rmpe3d/which_nodejs_framework_would_you_recommend_for/

[^16]: https://serverspace.us/support/help/how-to-get-lets-encrypt-ssl-on-ubuntu/

[^17]: https://api.audiobookshelf.org

[^18]: https://restfulapi.net/resource-naming/

[^19]: https://studiekiezer.ugent.be/2023/studiefiche/en/C003779

[^20]: https://ruben.verborgh.org/teaching/

[^21]: https://github.com/RubenVerborgh/

[^22]: https://studiekiezer.ugent.be/2024/studiefiche/nl/C003779

[^23]: https://dev.to/elijahtrillionz/build-a-crud-api-with-fastify-688

[^24]: https://rubenverborgh.github.io/WebFundamentals/birds-eye-view/

[^25]: https://www.youtube.com/watch?v=WDrU305J1yw

[^26]: https://www.youtube.com/watch?v=ACVBMrgdXgE

[^27]: https://stackoverflow.com/questions/12195556/mongodb-schema-design

[^28]: https://scholar.google.com/citations?user=EczUsIYAAAAJ\&hl=en

[^29]: https://www.youtube.com/watch?v=rMiRZ1iRC0A

[^30]: https://www.sitepoint.com/create-rest-api-fastify/

