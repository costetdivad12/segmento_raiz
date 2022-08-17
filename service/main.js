const sql = require('mssql')
const sqlConfig = require('../database/db')

module.exports.consultarAltisonantes = async (req, res, next)=>{
    const SQL = 'SELECT S_TOKEN, S_REEMPLAZO FROM CS_TokenReemplazo;';
    await sql.connect(sqlConfig);
    const {recordsets} = await sql.query(SQL);
    res.json(recordsets[0]);
}

module.exports.generarSegmentoRaizTest = async (req, res, next)=>{
    const SQL = `
        SELECT 
            AP_PATERNO,
            AP_MATERNO,
            NOMBRE,
            ID_GENERO,
            DT_NACIMIENTO,
            CURP,
            RENAPO AS DOMICILIO
        FROM S_RAIZ
        WHERE RENAPO <> NULL 
        OR RENAPO <> '';
    `;

    await sql.connect(sqlConfig)
    const {recordsets} = await sql.query(SQL)
    
    const arr = [];
    let valids = 0;
    for (const record of recordsets[0]) {
        let curp = record['CURP'];
        if (curp.length >= 18) {
            curp = curp.substring(0,16);
        }
        const data = {
            nombre: record['NOMBRE'],
            primerApellido: record['AP_PATERNO'],
            segundoApellido: record['AP_MATERNO'],
            sexo: record['ID_GENERO'],
            fechaNacimiento: record['DT_NACIMIENTO'].replace(/\//g,'-'),
            entidadNacimiento: record['DOMICILIO'],
            curp
        };
        const segmentoRaiz = await generarSegmentoRaizPorDatos(data);
        data['segmentoRaiz'] = segmentoRaiz;
        data['valido'] = false;
        if (segmentoRaiz === data['curp']) {
            data['valido'] = true;
            valids++;
        }
        await saveInDB(data['segmentoRaiz'], data['valido'], record['CURP']);
        arr.push(data);
    }

    let result = {
        data: arr,
        records: arr.length,
        valids
    }
    res.json(result);
}

module.exports.generarSegmentoRaiz = async (req, res, next)=>{
    const body = req.body;

    let segmentoRaiz = await generarSegmentoRaizPorDatos(body);

    res.status(200).json({segmentoRaiz});
}

async function saveInDB(segmento, valido, curp) {
    const SQL = `
        UPDATE S_RAIZ SET 
            SEGMENTO_2 = '${segmento}', 
            VALIDACION_2 = '${valido?'true':'false'}' 
        WHERE CURP = '${curp}';
    `;

    await sql.connect(sqlConfig)
    await sql.query(SQL)
}

async function generarSegmentoRaizPorDatos(datos) {
    // Obtener datos
    let nombre = datos['nombre'];
    let primerApellido = datos['primerApellido'];
    let segundoApellido = datos['segundoApellido'];
    let sexo = datos['sexo'];
    let fechaNacimiento = datos['fechaNacimiento'];
    let entidadNacimiento = datos['entidadNacimiento'];

    // Validar nombre completo
    nombre = validarPreposicionesArticulosYDiacriticos(nombre, true);
    primerApellido = validarPreposicionesArticulosYDiacriticos(primerApellido);
    segundoApellido = validarPreposicionesArticulosYDiacriticos(segundoApellido);
    
    // Generar segmento del nombre
    const segmentoNombre = await validarAltisonantesFromBd(generarSegmentoNombre(nombre, primerApellido, segundoApellido));
    const segmentoFechaNacimiento = generarSegmentoFechaNacimiento(fechaNacimiento);
    const segmentoConsonantes = generarSegmentoConsonantes(nombre, primerApellido, segundoApellido);

    return segmentoNombre+segmentoFechaNacimiento+sexo+entidadNacimiento+segmentoConsonantes;
}

function validarPreposicionesArticulosYDiacriticos(cadena, isNombre = false) {
    cadena = cadena ?? '';

    // Excepciones donde el nombre/apellido comience con "-"
    cadena = cadena.startsWith('-')?'X':cadena;

    // Artículos en nombres ej. "MARÍA DE LOS ÁNGELES DEL RÍO DE LA MAR"
    const ARR = [
        'DA', 
        'DAS', 
        'DE', 
        'DEL', 
        'DER', 
        'DI', 
        'DIE', 
        'DD', 
        'EL', 
        'LA', 
        'LOS', 
        'LAS', 
        'LE', 
        'LES', 
        'MAC', 
        'MC', 
        'VAN', 
        'VON', 
        'Y'
    ];

    const NOMBRES_DE_EXCEPCION = [
        'MA', 'MARIA', 'JOSE', 'J'
    ];

    // Pattern para reemplazar las "Ñ" por "X"
    const DIACRITICO_ENIE_PATTERN = /Ñ/g;

    // Pattern para eliminar apóstrofes en nombres
    // ej. HORACIO L'AVION COSTET
    // ej. O'FERRER MERCHAND ALEXANDRA
    // ej. JR. DAMIÁN MORALES OROZCO
    const APOSTROFES_PATTERN = /'|´|`|’|,/g;

    // Pattern para letras aisladas entre espacios en balnco ej. " Y "
    const LETRAS_AISLADAS_PATTERN = /(\\s[A-ZÁÉÍÓÚ]\\s)/g;

    // Pattern para normalizar signos diacríticos 
    // ej. "ÁÃÀÄÂÉËÈÊÍÏÌÎÓÖÒÔÚÜÙÛ" => "AAAAAEEEEIIIIOOOOUUUU"
    const SIGNOS_DIACRITICOS_PATTERN = /[\u0300-\u036f]/g;

    // Pattern para eliminar espacios en blanco adicionales 
    // ej. "PALABRA1     PALABRA2" => "PALABRA1 PALABRA2"
    const WHITE_SAPCES_PATTERN = /\s+/g;
    
    // Aplica las validaciones definidas anteriormente
    cadena = cadena.toUpperCase()
    .replace(/\./g,'')
    .replace(DIACRITICO_ENIE_PATTERN, 'X')
    .replace(APOSTROFES_PATTERN, '')
    .replace(LETRAS_AISLADAS_PATTERN,'')
    .normalize("NFD")
    .replace(SIGNOS_DIACRITICOS_PATTERN, '')
    .replace(WHITE_SAPCES_PATTERN, ' ')
    .trim();
    
    // Elimina los artículos de la cadena (LAS, LOS, DEL, LA, DE...)
    // Y elimina las posiciones que sólo contengan 1 caracter
    let cadenaArr = cadena.split(' ');
    for (let i = 0; i < cadenaArr.length; i++) {
        cadenaArr[i] = ARR.find(c=>c==cadenaArr[i])
        ? '' 
        : cadenaArr[i];
    }
    /*
        Caso particular para los nombres
        Los María y José no se consideran como primer nombre
        cuando la persona tiene más de 1 nombre
        ej. "JOSÉ DAVID COSTET ORIHUELA" => "COOD910405HMSSRV09"
        nota que el cuarto caracter del CURP toma la primera 
        letra del segundo nombre
    */
    if (isNombre && (NOMBRES_DE_EXCEPCION.includes(cadenaArr[0]) && cadenaArr.length > 1)) {
        cadenaArr.shift();
    }

    
    return cadenaArr.join(' ')
    .replace(WHITE_SAPCES_PATTERN, ' ')
    .trim()
    .split(' ')[0];
}

function obtenerCaracter(pattern, cadena, index) {
    let especiales = ['/','-','.'];
    for (let i = index; i < cadena.length; i++) {
        if (especiales.find(c=>c==cadena[i])) {
            return 'X'
        }
        if (pattern.test(cadena[i])) {
            return cadena[i];
        }
    }
    return 'X';
}

function generarSegmentoNombre(nombre, primerApellido, segundoApellido) {
    const VOCALES = /[AEIOU]/g;

    /*
        NOTA: inicializa el índice en 1 debido a los casos 
        de excepción como: "ABDON MIRELES DIEGO MANUEL" => "AOMD",
        evitando que use la letra "A", que ya fue utilizada
        compo primer caracter del segmento.
    */
    const primerCaracter = primerApellido[0];
    const segundoCaracter = obtenerCaracter(VOCALES, primerApellido, 1);
    const tercerCaracter = segundoApellido[0]??'X';
    const cuartoCaracter = nombre[0];

    return primerCaracter+segundoCaracter+tercerCaracter+cuartoCaracter;
}

function generarSegmentoFechaNacimiento(date) {
    const arr = date.split('-');
    arr[0] = arr[0].substring(2,4);
    return arr[0]+arr[1]+arr[2];
}

function generarSegmentoConsonantes(nombre, primerApellido, segundoApellido) {
    const CONSONANTES_PRIMER_APELLIDO = /[BCDFGHJKLMNPQRSTVWXYZ]/g;
    const CONSONANTES_SEGUNDO_APELLIDO = /[BCDFGHJKLMNPQRSTVWXYZ]/g;
    const CONSONANTES_NOMBRE = /[BCDFGHJKLMNPQRSTVWXYZ]/g;

    let consonantePrimerApellido = obtenerCaracter(CONSONANTES_PRIMER_APELLIDO, primerApellido, 1);
    let consonanteSegundoApellido = obtenerCaracter(CONSONANTES_SEGUNDO_APELLIDO, segundoApellido, 1);
    let consonanteNombre = obtenerCaracter(CONSONANTES_NOMBRE, nombre, 1);
    
    return consonantePrimerApellido+consonanteSegundoApellido+consonanteNombre;
}

async function validarAltisonantesFromBd(segmento) {
    const SQL = `SELECT S_REEMPLAZO FROM CS_TokenReemplazo WHERE S_TOKEN = '${segmento}';`;
    await sql.connect(sqlConfig);
    const {recordsets} = await sql.query(SQL);
    return recordsets[0].length > 0 
    ? recordsets[0][0]['S_REEMPLAZO'] 
    : segmento;
}

function validarAltisonantes(segmento) {
    let map = {
        "BACA":"BXCA",
        "BAKA":"BXKA",
        "BUEI":"BXEI",
        "BUEY":"BXEY",
        "CACA":"CXCA",
        "CACO":"CXCO",
        "CAGA":"CXGA",
        "CAGO":"CXGO",
        "CAKA":"CXKA",
        "CAKO":"CXKO",
        "COGE":"CXGE",
        "COGI":"CXGI",
        "COJA":"CXJA",
        "COJE":"CXJE",
        "COJI":"CXJI",
        "COJO":"CXJO",
        "COLA":"CXLA",
        "CULO":"CXLO",
        "FALO":"FXLO",
        "FETO":"FXTO",
        "GETA":"GXTA",
        "GUEI":"GXEI",
        "GUEY":"GXEY",
        "JETA":"JXTA",
        "JOTO":"JXTO",
        "KACA":"KXCA",
        "KACO":"KXCO",
        "KAGA":"KXGA",
        "KAGO":"KXGO",
        "KAKA":"KXKA",
        "KAKO":"KXKO",
        "KOGE":"KXGE",
        "KOGI":"KXGI",
        "KOJA":"KXJA",
        "KOJE":"KXJE",
        "KOJI":"KXJI",
        "KOJO":"KXJO",
        "KOLA":"KXLA",
        "KULO":"KXLO",

        "LOCO":"LXCO",
        "LOKA":"LXKA",
        "LOKO":"LXKO",
        "LOCA":"LXCA",
        "LILO":"LXLO",

        "MAME":"MXME",
        "MAMO":"MXMO",
        "MEAR":"MXAR",
        "MEAS":"MXAS",
        "MEON":"MXON",
        "MIAR":"MXAR",
        "MION":"MXON",
        "MOCO":"MXCO",
        "MOKO":"MXKO",
        "MULA":"MXLA",
        "MULO":"MXLO",
        
        "NACA":"NXCA",
        "NACO":"NXCO",

        

        
        "PEDA":"PXDA",
        "PEDO":"PXDO",
        "PENE":"PXNE",
        "PIPI":"PXPI",
        "PITO":"PXTO",
        "POPO":"PXPO",
        "PUTA":"PXTA",
        "PUTO":"PXTO",

        "QULO":"QXLO",

        "RATA":"RXTA",
        "ROBA":"RXBA",
        "ROBE":"RXBE",
        "ROBO":"RXBO",
        "RUIN":"RXIN",

        "SENO":"SXNO",
        
        "TETA":"TXTA",
        
        "VACA":"VXCA",
        "VAGA":"VXGA",
        "VAGO":"VXGO",
        "VAKA":"VXKA",
        "VUEI":"VXEI",
        "VUEY":"VXEY",

        "WUEI":"WXEI",
        "WUEY":"WXEY"
        
        
    }
    return map[segmento] ?? segmento;
}