const GdriveFS = require("../dist/GdriveFS");

async function create() {
    const gfs = new GdriveFS({
        key: require("../masterKey.json"),
        debug: true,
    });
    const data = await gfs.createFolder("Movies");
    console.log(data);
}

create();
