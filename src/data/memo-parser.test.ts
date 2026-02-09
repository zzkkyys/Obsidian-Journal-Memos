import { parseMemoBlockBody } from "./memo-parser";

describe("memo-parser", () => {
    test("should parse a standard memo block", () => {
        const body = `created: 2023-10-27 10:00
Hello world, this is a test memo.`;
        const result = parseMemoBlockBody(body);
        expect(result).not.toBeNull();
        expect(result?.createdLabel).toBe("2023-10-27 10:00");
        expect(result?.content).toBe("Hello world, this is a test memo.");
    });

    test("should parse tags", () => {
        const body = `created: 2023-10-27 10:00
Hello #world #test`;
        const result = parseMemoBlockBody(body);
        expect(result?.tags).toContain("#world");
        expect(result?.tags).toContain("#test");
    });

    test("should parse attachments block", () => {
        const body = `created: 2023-10-27 10:00
My Image
<!-- jm-attachments:start -->
jm-attachment: image.png
<!-- jm-attachments:end -->`;
        const result = parseMemoBlockBody(body);
        expect(result?.content).toBe("My Image");
        const attachments = result?.attachments;
        expect(attachments).toBeDefined();
        if (attachments && attachments.length > 0) {
            const firstAttachment = attachments[0];
            expect(firstAttachment).toBeDefined();
            if (firstAttachment) {
                expect(firstAttachment.path).toBe("image.png");
                expect(firstAttachment.isImage).toBe(true);
            }
        }
    });

    test("should return null if created line is missing", () => {
        const body = `Hello world`;
        const result = parseMemoBlockBody(body);
        expect(result).toBeNull();
    });

    test("should handle chinese characters", () => {
        const body = `created: 2023-10-27 10:00
你好 #世界`;
        const result = parseMemoBlockBody(body);
        expect(result?.content).toBe("你好 #世界");
        expect(result?.tags).toContain("#世界");
    });

    test("should ignore invalid tags", () => {
        const body = `created: 2023-10-27 10:00
Not a # tag`;
        const result = parseMemoBlockBody(body);
        expect(result?.tags).toHaveLength(0); // Assuming space after # invalidates tag
    });
});
