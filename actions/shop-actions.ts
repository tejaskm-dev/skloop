"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export interface PurchaseResult {
    success: boolean;
    error?: string;
    coins?: number;
    inventory?: string[];
    streakShields?: number;
}

/**
 * Buys a shop item for the *currently authenticated* user.
 *
 * This replaces the previous client-side purchase, which computed
 * `newCoins = coins - item.price` in the browser and wrote it straight to
 * `profiles`. That let anyone set their own balance from devtools.
 *
 * Here the price is resolved server-side (shop_items table, falling back to the
 * SHOP_ITEMS constant) and the balance check plus deduction happen inside the
 * purchase_shop_item RPC under a row lock, so concurrent buys can't both pass.
 */
export async function purchaseShopItem(itemId: string): Promise<PurchaseResult> {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, error: "Not authenticated" };
    }

    if (typeof itemId !== "string" || itemId.length === 0 || itemId.length > 100) {
        return { success: false, error: "Invalid item" };
    }

    // ── Resolve the authoritative price. Never trust a client-supplied one. ──
    let price: number | null = null;
    let isConsumable = false;

    const { data: dbItem } = await supabase
        .from("shop_items")
        .select("price, category")
        .eq("id", itemId)
        .maybeSingle();

    if (dbItem) {
        price = dbItem.price;
        isConsumable = dbItem.category === "consumable";
    } else {
        const { SHOP_ITEMS } = await import("@/lib/shop-items");
        const item = SHOP_ITEMS.find((i) => i.id === itemId);
        if (item) {
            price = item.price;
            isConsumable = item.category === "consumable";
        }
    }

    if (price === null) {
        return { success: false, error: "Item not found" };
    }

    const { data, error } = await supabase.rpc("purchase_shop_item", {
        p_item_id: itemId,
        p_price: price,
        p_is_consumable: isConsumable,
    });

    if (error) {
        console.error("purchaseShopItem RPC error:", error.message);
        return { success: false, error: "Purchase failed" };
    }

    const result = data as {
        success: boolean;
        error?: string;
        coins?: number;
        inventory?: string[];
        streak_shields?: number;
    };

    if (!result?.success) {
        return { success: false, error: result?.error || "Purchase failed" };
    }

    revalidatePath("/shop");
    revalidatePath("/profile");

    return {
        success: true,
        coins: result.coins,
        inventory: result.inventory ?? [],
        streakShields: result.streak_shields ?? 0,
    };
}

/**
 * Activates a consumable boost from the caller's own inventory.
 * The multiplier and duration are fixed inside the RPC, so the client can't
 * pick its own. Replaces activateBoostItem(userId, itemId).
 */
export async function activateBoostItem(itemId: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    expires?: string;
}> {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, error: "Not authenticated" };
    }

    const { data, error } = await supabase.rpc("activate_boost_item", {
        p_item_id: itemId,
    });

    if (error) {
        console.error("activateBoostItem RPC error:", error.message);
        return { success: false, error: "Could not activate boost" };
    }

    const result = data as { success: boolean; error?: string; expires?: string };

    if (!result?.success) {
        return { success: false, error: result?.error || "Could not activate boost" };
    }

    revalidatePath("/profile");
    revalidatePath("/shop");

    return { success: true, message: "Boost activated!", expires: result.expires };
}

/**
 * Equips (or unequips, with itemId = null) a cosmetic slot for the caller.
 * The RPC verifies the item is actually in their inventory — the previous
 * client-side write let anyone equip anything they'd never bought.
 */
export async function equipCosmetic(
    slot: "equipped_title" | "equipped_ring" | "equipped_frame",
    itemId: string | null
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, error: "Not authenticated" };
    }

    const { data, error } = await supabase.rpc("equip_cosmetic", {
        p_slot: slot,
        p_item_id: itemId,
    });

    if (error) {
        console.error("equipCosmetic RPC error:", error.message);
        return { success: false, error: "Failed to equip" };
    }

    const result = data as { success: boolean; error?: string };
    if (!result?.success) {
        return { success: false, error: result?.error || "Failed to equip" };
    }

    revalidatePath("/profile");
    return { success: true };
}
