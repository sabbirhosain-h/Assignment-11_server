const express = require('express');
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');


// middlewear
require('dotenv').config();
app.use(cors());



const port = 3000;
const uri = `mongodb+srv://${process.env.Db_Username}:${process.env.Db_Password}@crud.7q5wtjc.mongodb.net/?appName=CRUD`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    
    // await client.connect();
    const DB = client.db("LibrisGo");
    const AllBookCollection = DB.collection("AllBooks");

    //root route
    app.get('/', (req, res) => {
    res.send('Hello World!')
    })


    // error api
    app.all(/.*/, (req,res)=>{
        res.status(404).json({
            status: 404,
            error: "Api Not Found"
        })
    })
    
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);






app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
