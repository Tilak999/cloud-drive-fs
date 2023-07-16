const GdriveFS = require("../build/GdriveFS").default;
const keys = require("../masterKey.json")

async function getStorage(gfs) {
    const keyIds = Object.keys(keys.serviceAccounts)
    
    for(let i=0; i< keyIds.length; i++) {
        const key = keys.serviceAccounts[keyIds[i]]
        console.log(keyIds[i])
        const storage = await gfs.getStorageInfo(key)
        console.log(storage)
    }
}

getStorage(
    new GdriveFS({
        key: require("../masterKey.json"),
        debug: true,
    })
);
