const express = require('express');
const app = express();
app.get('/api/data', (req, res) => res.json({ data: [] }));
app.listen(3000);
