import line from "@line/bot-sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
});

const liffId = process.env.LIFF_ID || "";
const registerUri = liffId ? `https://liff.line.me/${liffId}` : "";
const richMenuImagePath = path.join(process.cwd(), "assets", "richmenu-buttons", "richmenu_full.png");

const richMenuJson = {
  size: {
    width: 2500,
    height: 843,
  },
  selected: true,
  name: "IBMDT Run Main Menu",
  chatBarText: "IBMDT Run Menu",
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 833,
        height: 843,
      },
      action: registerUri
        ? {
            type: "uri",
            label: "ลงทะเบียน",
            uri: registerUri,
          }
        : {
            type: "message",
            label: "ลงทะเบียน",
            text: "ลงทะเบียน",
          },
    },
    {
      bounds: {
        x: 833,
        y: 0,
        width: 833,
        height: 843,
      },
      action: {
        type: "message",
        label: "ส่งผลวิ่ง",
        text: "ส่งผลวิ่ง",
      },
    },
    {
      bounds: {
        x: 1666,
        y: 0,
        width: 834,
        height: 843,
      },
      action: {
        type: "message",
        label: "ดูผล",
        text: "/result",
      },
    },
  ],
};

async function setupRichMenu() {
  try {
    if (!fs.existsSync(richMenuImagePath)) {
      throw new Error(`Rich Menu image not found: ${richMenuImagePath}`);
    }

    console.log("📋 Uploading Rich Menu...");
    console.log(`Using LIFF ID: ${liffId || "(not set)"}`);

    // Get existing rich menus first
    const existingMenus = await client.getRichMenuList();
    console.log(`Found ${existingMenus.length ?? 0} existing menus`);

    // Delete existing menus if any
    if (existingMenus.length > 0) {
      for (const menu of existingMenus) {
        console.log(`Deleting old menu: ${menu.name}`);
        await client.deleteRichMenu(menu.richMenuId);
      }
    }

    // Create new rich menu
    const result = await client.createRichMenu(richMenuJson);
    console.log(`✅ Rich Menu created: ${result}`);

    const image = fs.readFileSync(richMenuImagePath);
    await client.setRichMenuImage(result, image, "image/png");
    console.log("✅ Rich Menu image uploaded");

    // Set as default rich menu
    await client.setDefaultRichMenu(result);
    console.log(`✅ Set as default Rich Menu`);

    console.log("\n🎉 Rich Menu setup complete!");
    console.log("Menu buttons:");
    richMenuJson.areas?.forEach((area, i) => {
      console.log(`  ${i + 1}. ${area.action.label}`);
    });
  } catch (error) {
    console.error("❌ Error setting up Rich Menu:", error);
    process.exit(1);
  }
}

setupRichMenu();
