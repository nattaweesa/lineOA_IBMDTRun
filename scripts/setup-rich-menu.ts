import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

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

async function lineApi(pathname: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.line.me${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API ${init.method || "GET"} ${pathname} failed: ${res.status} ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function setupRichMenu() {
  try {
    if (!channelAccessToken) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
    }
    if (!fs.existsSync(richMenuImagePath)) {
      throw new Error(`Rich Menu image not found: ${richMenuImagePath}`);
    }

    console.log("📋 Uploading Rich Menu...");
    console.log(`Using LIFF ID: ${liffId || "(not set)"}`);

    // Get existing rich menus first
    const existing = await lineApi("/v2/bot/richmenu/list");
    const existingMenus = existing.richmenus || [];
    console.log(`Found ${existingMenus.length} existing menus`);

    // Delete existing menus if any
    if (existingMenus.length > 0) {
      for (const menu of existingMenus) {
        console.log(`Deleting old menu: ${menu.name}`);
        await lineApi(`/v2/bot/richmenu/${menu.richMenuId}`, { method: "DELETE" });
      }
    }

    // Create new rich menu
    const created = await lineApi("/v2/bot/richmenu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(richMenuJson),
    });
    const richMenuId = created.richMenuId;
    console.log(`✅ Rich Menu created: ${richMenuId}`);

    const image = fs.readFileSync(richMenuImagePath);
    await lineApi(`/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: image,
    });
    console.log("✅ Rich Menu image uploaded");

    // Set as default rich menu
    await lineApi(`/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST" });
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
