const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Connect to SQLite database
const db = new sqlite3.Database('./clients.db', (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Close DB gracefully on exit
const closeDb = () => db.close((err) => {
  if (err) console.error("Error closing database", err.message);
  else console.log("Database connection closed.");
});
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

// Validate ID
const validateId = (id, callback) => {
  if (Number.isNaN(id)) {
    return callback({
      valid: false,
      messageObj: {
        message: 'Invalid id provided.',
        long_message: 'Id can only be integer.'
      }
    });
  }

  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      return callback({ valid: false, messageObj: { message: 'DB error.', long_message: err.message } });
    }

    if (!row) {
      return callback({
        valid: false,
        messageObj: {
          message: 'Invalid id provided.',
          long_message: 'Cannot find client with that id.'
        }
      });
    }

    callback({ valid: true });
  });
};

// Validate Priority
const validatePriority = (priority) => {
  if (Number.isNaN(priority) || priority < 1) {
    return {
      valid: false,
      messageObj: {
        message: 'Invalid priority provided.',
        long_message: 'Priority can only be positive integer.'
      }
    };
  }
  return { valid: true };
};

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).send({ message: 'SHIPTIVITY API. Read documentation to see API docs' });
});

// Get all clients or by status
app.get('/api/v1/clients', (req, res) => {
  const { status } = req.query;

  if (status && !['backlog', 'in-progress', 'complete'].includes(status)) {
    return res.status(400).send({
      message: 'Invalid status provided.',
      long_message: 'Status can only be one of the following: [backlog | in-progress | complete].'
    });
  }

  const query = status
    ? 'SELECT * FROM clients WHERE status = ?'
    : 'SELECT * FROM clients';
  const params = status ? [status] : [];

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).send({ message: 'DB error.', long_message: err.message });
    res.status(200).send(rows);
  });
});

// Get client by ID
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  validateId(id, ({ valid, messageObj }) => {
    if (!valid) return res.status(400).send(messageObj);

    db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).send({ message: 'DB error.', long_message: err.message });
      res.status(200).send(row);
    });
  });
});

// Update client status or priority
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  validateId(id, ({ valid, messageObj }) => {
    if (!valid) return res.status(400).send(messageObj);

    let { status, priority } = req.body;

    db.all('SELECT * FROM clients', [], (err, clients) => {
      if (err) return res.status(500).send({ message: 'DB error.', long_message: err.message });

      const client = clients.find(c => c.id === id);
      if (!client) return res.status(404).send({ message: 'Client not found.' });

      const updates = [];
      const params = [];

      if (status) {
        if (!['backlog', 'in-progress', 'complete'].includes(status)) {
          return res.status(400).send({
            message: 'Invalid status provided.',
            long_message: 'Status must be one of: backlog, in-progress, complete.'
          });
        }
        updates.push('status = ?');
        params.push(status);
      }

      if (priority !== undefined) {
        priority = parseInt(priority);
        const { valid, messageObj } = validatePriority(priority);
        if (!valid) return res.status(400).send(messageObj);

        updates.push('priority = ?');
        params.push(priority);
      }

      if (updates.length === 0) {
        return res.status(400).send({ message: 'No valid fields to update.' });
      }

      params.push(id);
      const query = `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`;

      db.run(query, params, function (err) {
        if (err) return res.status(500).send({ message: 'DB update error.', long_message: err.message });

        db.all('SELECT * FROM clients', [], (err, updatedClients) => {
          if (err) return res.status(500).send({ message: 'DB fetch error.', long_message: err.message });
          res.status(200).send(updatedClients);
        });
      });
    });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
