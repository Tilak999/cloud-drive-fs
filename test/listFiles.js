const GdriveFS = require("../build/GdriveFS").default;

async function list(gfs) {
    const all = await gfs.list();
    all.map((f) => {
        console.log(f);
    });
}

list(
    new GdriveFS({
        key: require("../masterKey.json"),
        debug: true,
    })
);
