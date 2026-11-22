"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/data/queries";
import { createTopicDb, deleteTopicDb, duplicateTopicDb, saveTopicDb } from "@/lib/topics/store";
import type { Topic } from "@/lib/topics/types";

// Topics are personal: every signed-in person has their own, and row level
// security on custom_topics keeps them apart.
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; message: string };
const fail = (e: unknown) => ({ ok: false as const, message: (e as Error).message });

export async function createTopic(name: string, template = "blank"): Promise<Result<Topic>> {
  await getViewer(); // must be signed in
  if (!name.trim()) return { ok: false, message: "Type a name first." };
  try {
    const data = await createTopicDb(name, template);
    revalidatePath("/money");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateTopic(id: string): Promise<Result<Topic>> {
  await getViewer();
  try {
    const data = await duplicateTopicDb(id);
    revalidatePath("/money");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTopic(topic: Topic): Promise<Result> {
  await getViewer();
  try {
    await saveTopicDb(topic);
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTopic(id: string): Promise<Result> {
  await getViewer();
  try {
    await deleteTopicDb(id);
    revalidatePath("/money");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
