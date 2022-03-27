const GdriveFS = require("../dist/GdriveFS").default;
const fs = require("fs");

async function main() {
    const gfs = new GdriveFS({ key: require("../masterKey.json"), debug: true });

    // Get storage info
    const storage = await gfs.getStorageInfo();
    console.log(storage);

    // Create folder: Series
    console.log("Create folder Series");
    const data1 = await gfs.createFolder(`Series`);
    console.log(`Folder created : ${data1.name} , ${data1.id}`);

    // Create folder: Movie
    console.log("Create folder Movie");
    const data2 = await gfs.createFolder(`Movie`);
    console.log(`Folder created : ${data2.name} , ${data2.id}`);

    const file = __dirname + "/main.js";
    console.log("Uploading:", file);
    const fileData = await gfs.uploadFile(fs.createReadStream(file), {
        name: `main.js`,
        size: fs.lstatSync(file).size,
        progress: (e) => console.log(e),
        parentId: data1.id,
    });

    const items = await gfs.list(data1.id);
    console.log("Listing Directory:", data1.name);
    items.forEach((element) => {
        console.log("[Test]", element.name, element.id);
    });

    console.log("Moving file from Series -> Movies");
    await gfs.move(fileData.id, data2.id);

    const items2 = await gfs.list(data2.id);
    console.log("Listing Directory:", data2.name);
    items2.forEach((element) => {
        console.log("[Test]", element.name, element.id);
    });

    await gfs.delete(data1.id);
    await gfs.delete(data2.id);
}

main();
