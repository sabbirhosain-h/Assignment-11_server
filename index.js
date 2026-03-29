const express = require('express');
const app = express();
const cors = require("cors");
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");

const serviceAccount = require("./librisgo-firebase-admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});




// middlewear
app.use(cors());
app.use(express.json());

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};



const port = 3000;
// const uri = `mongodb://:@crud.7q5wtjc.mongodb.net/?appName=CRUD`;
const uri = `mongodb://${process.env.Db_Username}:${process.env.Db_Password}@ac-d7aulfr-shard-00-00.7q5wtjc.mongodb.net:27017,ac-d7aulfr-shard-00-01.7q5wtjc.mongodb.net:27017,ac-d7aulfr-shard-00-02.7q5wtjc.mongodb.net:27017/?ssl=true&replicaSet=atlas-4ayi20-shard-0&authSource=admin&appName=CRUD`;

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
    const PaymentHistory = DB.collection("Payment");
    const WishlistCollection = DB.collection("Wishlist");
    const InvoiceCollection = DB.collection("Invoice");
    const UserCollections = DB.collection("Users")

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const user = await UserCollections.findOne({ email });
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Admins only" });
      }
      next();
    };

    const verifyLibrarian = async (req, res, next) => {
      const email = req.decoded_email;
      const user = await UserCollections.findOne({ email });
      if (user?.role !== "librarian") {
        return res.status(403).send({ message: "Librarians only" });
      }
      next();
    };

    //root route
    app.get('/', (req, res) => {
      res.send('Hello from LibrisGo Server')
    })

    // all books
    app.get("/AllBooks", async (req, res) => {
      const { skip = 0, limit = 0, sort = "name", order = "asc", search = "" } = req.query;

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

      res.send({ result, total: count });
    })


    // Add books
    app.post("/AllBooks", async (req, res) => {
      const newBook = req.body;
      const result = await AllBookCollection.insertOne({ ...newBook, createdAt: new Date() });
      res.send(result);
    });


    // get single book
    app.get("/AllBooks/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const book = await AllBookCollection.findOne({ _id: new ObjectId(id) });
        if (!book) {
          return res.status(404).json({ message: "Book not found" });
        }

        res.status(200).send(book);
      } catch (error) {
        res.status(400).json({ message: "Invalid book ID" });
      }
    })

    // payment  posting
    app.post("/payment", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const result = await PaymentHistory.insertOne({
          BuyerName: paymentInfo.buyerName,
          bookId: paymentInfo.id,
          email: paymentInfo.email,
          author: paymentInfo.author,
          phone: paymentInfo.phone,
          address: paymentInfo.address,
          url: paymentInfo.url,
          bookName: paymentInfo.bookName,
          price: paymentInfo.price,
          status: "pending",
          payment: "Unpaid",
          createdAt: new Date()
        });

        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ error: "Payment failed" });
      }
    });

    // payment history
    app.get("/payment", async (req, res) => {
      const { id } = req.query;
      if (!id) {
        return res.status(400).send({ error: "id is required" });
      }
      const result = await PaymentHistory.findOne({ bookId: id })

      res.status(200).send(result);
    });

    // My orders
    app.get("/MyOrders", verifyToken, async (req, res) => {
      try {
        const { e } = req.query;
        if (e !== req.decoded_email) {
          return res.status(403).send({ massage: "forbiden access" })
        }

        if (!e) {
          return res.status(400).send({ error: "email is required" });
        }

        const result = await PaymentHistory.find({ email: e }).toArray();
        res.send(result);
      } catch (error) {
        console.error("MyOrders error:", error);
        res.status(500).send({ error: "Failed to fetch orders" });
      }
    });

    // cancle order and chnage 
    app.patch("/payment/cancel/:id", async (req, res) => {

      try {
        const { id } = req.params;

        const result = await PaymentHistory.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "canceled" } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Order not found" });
        }

        res.send({ success: true, message: "Order canceled" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to cancel order" });
      }
    });

    // payment link
    app.post("/makePayment", async (req, res) => {
      try {
        const { finalPrice, Book, totalPrice, bookId } = req.body;


       const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;


        const session = await stripe.checkout.sessions.create({
          mode: "payment",

          payment_method_types: ["card"],

          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: Book,
                },
                unit_amount: Math.round(finalPrice * 10),
              },
              quantity: 1,
            },
          ],

          metadata: {
            orderId: orderId,
            bookName: Book,
            price: totalPrice,
            date: new Date().toISOString(),
            bookId: bookId
          },

          success_url: `${process.env.MY_DOMAIN}/PaySuccess?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.MY_DOMAIN}/payment/cancel`,
        });

        res.status(200).send({ checkoutUrl: session.url, orderId, })
      } catch (error) {
        console.error("MAKE PAYMENT ERROR:", error);
        res.status(500).json({ error: "Order creation failed" });
      }
    });

    // payment verificatin
    app.patch("/verifyPayment", async (req, res) => {
      try {
        const session_id = req.query.session_id;
        if (!session_id) {
          return res.status(400).json({ message: "session_id missing" });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        const { bookName, orderId, price, date, bookId } = session.metadata;


        const updateResult = await PaymentHistory.updateOne(
          { bookId: bookId },
          {
            $set: {
              payment: "Paid",
            }
          }
        );



        return res.status(200).json({ bookName, orderId, price, date });

      } catch (error) {
        console.error("VERIFY ERROR:", error);
        return res.status(500).json({ error: "Failed to verify payment" });
      }
    });

    // add to the wishlist
    app.post("/Wishlist/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const findBook = await AllBookCollection.findOne({ _id: new ObjectId(id) });

        if (findBook) {
          const existing = await WishlistCollection.findOne({ _id: new ObjectId(id) });

          if (existing) {
            return res.status(200).json({ message: "Already in wishlist" });
          }

          await WishlistCollection.insertOne(findBook);
          res.status(200).send(findBook);
        } else {
          res.status(404).json({ message: "Book not found" });
        }
      } catch (error) {
        console.error("Exact error:", error.message);
        res.status(500).json({ message: error.message });
      }
    });

    //  get my Wishlist
    app.get("/MyWishlist", async (req, res) => {
      const { email } = req.query;

      try {
        const books = await WishlistCollection.find({ email: email }).toArray();
        res.status(200).send(books);
      } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ message: error.message });
      }
    });

    //  remove from wishlist
    app.delete("/Wishlist/remove/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await WishlistCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
          res.status(200).json({ message: "Removed from wishlist" });
        } else {
          res.status(404).json({ message: "Book not found in wishlist" });
        }
      } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ message: error.message });
      }
    });

    // invoice HIstory
    app.post("/Invoice", async (req, res) => {
      try {
        const invoice = req.body;

        const existing = await InvoiceCollection.findOne({ orderId: invoice.orderId });
        if (existing) {
          return res.send({ message: "Invoice already exists" });
        }

        const result = await InvoiceCollection.insertOne(invoice);

        return res.send(result);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to save invoice" });
      }
    });

    // get my invoice
    app.get("/Invoice", async (req, res) => {
      try {
        const { Myemail } = req.query;
        const MyInv = await InvoiceCollection.find({ email: Myemail }).toArray();

        return res.send(MyInv);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch invoices" });
      }
    });

    // create role
    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await UserCollections.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists", inserted: false });
      }

      user.role = "user";
      user.createdAt = new Date();

      const result = await UserCollections.insertOne(user);
      res.send({ ...result, inserted: true });
    });

    // get all users
    app.get("/users", verifyToken, async (req, res) => {
      const email = req.decoded_email;
      if (!email) return res.status(401).json({ message: "Unauthorized" });

      const user = await UserCollections.findOne({ email });
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admins only" });
      } else {
        const result = await UserCollections.find().toArray();
        res.send(result);
      }

    })

    // update role 
    app.patch("/users/:id/role", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      const allowedRoles = ["user", "admin", "librarian"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      try {
        const result = await UserCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json({ success: true, message: `Role updated to ${role}` });
      } catch (error) {
        console.error("Role update error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // manage books 
    app.get("/manageBooks", async (req, res) => {
      const result = await AllBookCollection.find({}, { projection: { createdAt: 0, description: 0, email: 0, payment: 0, } }).toArray();
      res.send(result)
    });

    // Toggle status
    app.patch("/manageBooks/:id/status", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const allowed = ["published", "unpublished"];
      if (!allowed.includes(status))
        return res.status(400).json({ message: "Invalid status" });

      const result = await AllBookCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // Delete book
    app.delete("/manageBooks/:id", verifyToken, verifyLibrarian,  async (req, res) => {
      const { id } = req.params;
      const result = await AllBookCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // librarian books  
    app.get("/myBooks", verifyToken, verifyLibrarian,  async (req, res) => {
      const { email } = req.query;

      if (req.decoded_email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const user = await UserCollections.findOne({ email });
      if (user?.role !== "librarian") {
        return res.status(403).send({ message: "Librarians only" });
      }

      const result = await AllBookCollection.find(
        { email },
        { projection: { description: 0 } }
      ).toArray();
      res.send(result);
    });

    // GET single book by id
    app.get("/books/:id", verifyToken,verifyLibrarian,  async (req, res) => {
      const result = await AllBookCollection.findOne({
        _id: new ObjectId(req.params.id)
      });
      if (!result) return res.status(404).send({ message: "Book not found" });
      res.send(result);
    });

    // update book 
    app.put("/books/:id", verifyToken, async (req, res) => {
      const { id } = req.params;

      const book = await AllBookCollection.findOne({ _id: new ObjectId(id) });
      if (!book) return res.status(404).send({ message: "Book not found" });

      if (req.decoded_email !== book.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await AllBookCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      res.send(result);
    });

    // get order managemennt 
    app.get("/manageOrder", verifyToken, verifyLibrarian, async (req, res) => {
      const email = req.decoded_email;

      const result = await PaymentHistory.find(
        { email },
        {payment: "paid"},
        {
          projection: {
            description: 0,
            bookId: 0,
          }
        }
      ).toArray();
      console.log(result)
      res.send(result);
    });

    // manage order status 
    app.patch("/manageOrder/:id/status", verifyToken, verifyLibrarian, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["pending", "shipping", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
        return res.status(400).send({ message: "Invalid status" });
    }

    const result = await PaymentHistory.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
    );
    res.send(result);
});


    // error api
    app.all(/.*/, (req, res) => {
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
  console.log(process.env.Db_Username, process.env.Db_Password)
  console.log(`Example app listening on port ${port}`)
})
