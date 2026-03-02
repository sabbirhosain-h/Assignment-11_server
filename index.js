const express = require('express');
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');


// middlewear
require('dotenv').config();
app.use(cors());
app.use(express.json());


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
    res.send('Hello from LibrisGo Server')
    })

    // all books
    app.get("/AllBooks", async ( req , res ) => {
        const { skip = 0 , limit = 0 , sort = "name" , order = "asc" , search = ""} = req.query;

        const query = search ?
         {
            $or: [
              { bookName: { $regex: search, $options: "i" } },
              { author: { $regex: search, $options: "i" } }
               ]
            }
         :
         {}
      

        let sortQuery = {};

        if (sort === "name") {
          sortQuery = { bookName: order === "asc" ? 1 : -1 };
        } 
         else if (sort === "price") {
           sortQuery = { price: order === "asc" ? 1 : -1 };
        } 
         else if (sort === "rating") {
           sortQuery = { rating: order === "asc" ? 1 : -1 };
        }
        const result = await AllBookCollection.find(query)
        .sort(sortQuery)
        .limit(Number(limit))
        .skip(Number(skip))
        .toArray();

        const count = await AllBookCollection.countDocuments();

        res.send({result , total:count});
    })


    // Add books
    app.post("/AllBooks" , async (req , res)=>{
        const newBook = req.body;
        const result = await AllBookCollection.insertOne({ ...newBook, createdAt: new Date() });
        res.send(result);
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
