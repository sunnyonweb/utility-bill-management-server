// server/index.js
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Global variable to store the database instance
let db;

// Middleware
app.use(cors());
app.use(express.json());


// Function to connect to MongoDB

const uri = "mongodb+srv://utility-bill-management:vpvCjaUq3ipxlTRu@cluster0.6ve5zji.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});




// Basic Test Route
app.get('/', (req, res) => {
  res.send('Utility Bill Management Server is running!');
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // collection
    const db = client.db('utility_bill');
    const billsCollection = db.collection('bills');
    const myBillsCollection = db.collection('myBills');


    // get opparation

    app.get('/bills/recent', async (req, res) => {
      try {
        const cursor = billsCollection.find({})
          .sort({ date: -1 }) // Sort by date descending
          .limit(6); // Limit to 6 documents as required

        const result = await cursor.toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error('Error fetching recent bills:', error);
        res.status(500).send({ message: 'Failed to fetch recent bills.' });
      }
    });

    // 2. GET
    // category
    app.get('/bills', async (req, res) => {
      const { category } = req.query;
      const query = {};

      if (category) {
        // Filter by category 
        query.category = category;
      }

      try {
        const cursor = billsCollection.find(query);
        const result = await cursor.toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error('Error fetching bills:', error);
        res.status(500).send({ message: 'Failed to fetch bills.' });
      }
    });

    // 3. GET single bill by ID
    app.get('/bills/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await billsCollection.findOne(query);

        if (!result) return res.status(404).send({ message: 'Bill not found.' });
        res.status(200).send(result);
      } catch (error) {
        // This catches invalid ObjectId formats
        res.status(400).send({ message: 'Invalid Bill ID format.' });
      }
    });

    
    // 4. POST Add a new bill 
    app.post('/bills', async (req, res) => {
      const newBill = req.body;
      
      if (newBill.date) {
          newBill.date = new Date(newBill.date);
      }
      const result = await billsCollection.insertOne(newBill);
      res.status(201).send({ ...result, insertedId: result.insertedId });
    });

    // 5. POST Save a new paid bill record
    app.post('/my-bills', async (req, res) => {
      const paidBill = req.body;
      
      // Validation check for mandatory fields
      if (!paidBill.email || !paidBill.billId || !paidBill.amount) {
          return res.status(400).send({ message: 'Missing mandatory fields for payment.' });
      }

      // Convert billId string to ObjectId to reference the original bill
      try {
          paidBill.billId = new ObjectId(paidBill.billId);
      } catch (e) {
          return res.status(400).send({ message: 'Invalid Bill ID provided.' });
      }
      
      const result = await myBillsCollection.insertOne(paidBill);
      res.status(201).send({ ...result, insertedId: result.insertedId });
    });

    // 6. GET Get paid bills for a specific logged-in user
    app.get('/my-bills/:email', async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail };

      try {
        const cursor = myBillsCollection.find(query);
        const result = await cursor.toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error('Error fetching paid bills for user:', error);
        res.status(500).send({ message: 'Failed to fetch user paid bills.' });
      }
    });

    // 7. PATCH Update a user's paid bill record
    app.patch('/my-bills/:id', async (req, res) => {
      const id = req.params.id;
      const { amount, address, phone, date } = req.body;
      
      try {
          const query = { _id: new ObjectId(id) };
          const updateDoc = {
              $set: { amount, address, phone, date: new Date(date) }
          };
          
          const result = await myBillsCollection.updateOne(query, updateDoc);
          if (result.matchedCount === 0) return res.status(404).send({ message: 'Paid bill record not found.' });

          res.status(200).send({ message: 'Paid bill updated successfully.', modifiedCount: result.modifiedCount });
      } catch (error) {
          res.status(400).send({ message: 'Invalid ID or data provided.' });
      }
    });

    // 8. DELETE Delete a user's paid bill record
    app.delete('/my-bills/:id', async (req, res) => {
      const id = req.params.id;
      try {
          const query = { _id: new ObjectId(id) };
          const result = await myBillsCollection.deleteOne(query);

          if (result.deletedCount === 0) return res.status(404).send({ message: 'Paid bill record not found.' });
          
          res.status(200).send({ message: 'Paid bill record deleted successfully.' });
      } catch (error) {
          res.status(400).send({ message: 'Invalid ID format.' });
      }
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`utility bill server is running on port: ${port}`)
})