const fs = require("fs");
const line = require("@line/bot-sdk");

const liffId = process.env.LIFF_ID || "";

if (!liffId) {
  throw new Error("LIFF_ID is not set");
}

const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "IBMDT Run Main Menu",
  chatBarText: "IBMDT Run Menu",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: "uri",
        label: "ลงทะเบียน",
        uri: `https://liff.line.me/${liffId}`,
      },
    },
    {
      bounds: { x: 833, y: 0, width: 833, height: 843 },
      action: {
        type: "message",
        label: "ส่งผลวิ่ง",
        text: "ส่งผลวิ่ง",
      },
    },
    {
      bounds: { x: 1666, y: 0, width: 834, height: 843 },
      action: {
        type: "message",
        label: "ดูผล",
        text: "/result",
      },
    },
  ],
};

async function main() {
  const image = fs.readFileSync("/tmp/richmenu_full.png");
  const list = await client.getRichMenuList();

  for (const menu of list || []) {
    await client.deleteRichMenu(menu.richMenuId);
  }

  const created = await client.createRichMenu(richMenu);
  await client.setRichMenuImage(created, image, "image/png");
  await client.setDefaultRichMenu(created);

  console.log(JSON.stringify({ ok: true, richMenuId: created }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify(error.response?.data || error.message || String(error), null, 2));
  process.exit(1);
});