var express = require('express');
var router = express.Router();
var pkg = require('../package.json');
var MainService = require('../service/main')

router.post('/segmento/raiz', MainService.generarSegmentoRaiz)
router.get('/segmento/raiz/test', MainService.generarSegmentoRaizTest)
router.get('/altisonantes', MainService.consultarAltisonantes)

router.get('/', (req, res, next) => {
	res.json({
		name: pkg.name,
		version: pkg.version,
		description: pkg.description,
		keywords: pkg.keywords,
		author: pkg.author,
		license: pkg.license,
	});
});

module.exports = router;
