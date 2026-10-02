import type { ChatMessage } from "../memory/types.js";

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

export async function extractImageText(params: {
    modelClient: ModelClient;
    imageBase64: string | string[];
}): Promise<string> {
    const { modelClient, imageBase64 } = params;

    const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];

    const imageContent = images.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/png;base64,${b64}` },
    }));

    const textPrompt =
        images.length === 1
            ? "Extract the full text from this image exactly as shown."
            : `Extract the full text from these ${images.length} images exactly as shown. Combine the text from all images in order.`;

    const messages: ChatMessage[] = [
        {
            role: "system",
            content:
                "You are an OCR assistant. Extract the EXACT text from the image(s). " +
                "Return ONLY the raw text content — no explanations, no code, no JSON. " +
                "Preserve the original formatting, examples, and constraints exactly as shown. " +
                "If the image contains any diagrams, charts, or figures, " +
                "DESCRIBE their full structure in plain text. " +
                "For tree diagrams: list the tree as a level-order array. " +
                "For graphs: list all nodes and edges. " +
                "For any visual data structure: convert it to a text representation.",
        },
        {
            role: "user",
            content: [
                ...imageContent,
                {
                    type: "text" as const,
                    text: textPrompt,
                },
            ],
        },
    ];

    return modelClient.generate(messages);
}
