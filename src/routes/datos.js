// Entrega al navegador los datos que su rol puede ver.
const express = require("express");
const { construirDatos } = require("../services/datos");

const router = express.Router();

router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await construirDatos(req.usuario));
});

module.exports = router;
