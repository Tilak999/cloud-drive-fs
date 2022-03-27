const GdriveFS = require("../dist/GdriveFS");

async function list(gfs) {
    const all = await gfs.list();
    all.map((f) => console.log(f.name, f.id));
}

list(
    new GdriveFS({
        key: require("../masterKey.json"),
        debug: true,
    })
);
