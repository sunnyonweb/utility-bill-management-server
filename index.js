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


    // get opparation
    app.get('/bills', async(req,res)=> {
        const cursor = billsCollection.find();
        const result = await cursor.toArray();
        res.send(result)
    })

    app.get('/bills/:id', async(req,res)=> {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
       
        const result = await billsCollection.findOne(query);
        res.send(result)
    })

    
    // post oparation
    app.post('/bills', async(req,res) => {
        const newBills = req.body;
        const result = await billsCollection.insertOne(newBills);
        res.send(result);
    })


    // update oparation
    app.patch('/bills/:id', async(req, res) => {
        const id = req.params.id;
        const updatedBill = req.body;
        const query = {_id: new ObjectId(id)};
        const update = {
            $set: updatedBill
        }
        const result =await billsCollection.updateOne(query, update);
        res.send(result)
    })


    // delet oparation
    app.delete('/bills/:id', async (req,res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const reuslt = await billsCollection.deleteOne(query);
        res.send(result);
    })


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