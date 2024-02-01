const GdriveFS = require("../build/GdriveFS").default;

async function list(gfs) {
    const all = await gfs.list();
    all.files.map((f) => {
        console.log(f.id, f.name);
    });
}

list(
    new GdriveFS({
        key: require("../masterKey.json"),
        debug: true,
    })
);
