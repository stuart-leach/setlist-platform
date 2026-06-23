const INTERCOM_API_BASE = "https://api.intercom.io";

interface IntercomContactUpsert {
  email: string;
  external_id: string;
  name?: string;
  avatar?: { type: "avatar"; image_url: string };
  custom_attributes?: Record<string, string | number | boolean>;
}

export async function upsertIntercomContact(data: IntercomContactUpsert): Promise<string | null> {
  const token = process.env.INTERCOM_ACCESS_TOKEN;
  if (!token) return null;

  // Search for existing contact by external_id
  const searchRes = await fetch(`${INTERCOM_API_BASE}/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: {
        operator: "AND",
        value: [{ field: "external_id", operator: "=", value: data.external_id }],
      },
    }),
  });

  const searchJson = await searchRes.json();
  const existingId: string | undefined = searchJson?.data?.[0]?.id;

  const payload: Record<string, unknown> = {
    role: "user",
    email: data.email,
    external_id: data.external_id,
    ...(data.name ? { name: data.name } : {}),
    ...(data.avatar ? { avatar: data.avatar } : {}),
    ...(data.custom_attributes ? { custom_attributes: data.custom_attributes } : {}),
  };

  const url = existingId
    ? `${INTERCOM_API_BASE}/contacts/${existingId}`
    : `${INTERCOM_API_BASE}/contacts`;

  const method = existingId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("Intercom upsert failed:", await res.text());
    return null;
  }

  const json = await res.json();
  return json.id ?? null;
}
