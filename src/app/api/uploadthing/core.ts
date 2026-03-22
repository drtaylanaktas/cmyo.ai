import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
    // Define as many FileRoutes as you like, each with a unique routeSlug
    imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
        // Set permissions and file types for this FileRoute
        .middleware(async ({ req }) => {
            // This code runs on your server before upload
            // If you throw, the user will not be able to upload

            // TODO: Implement proper auth check here if needed
            // const user = await auth(req);
            // if (!user) throw new Error("Unauthorized");
            // return { userId: user.id };

            return { userId: "fake-user-id" };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            // This code RUNS ON YOUR SERVER after upload
            console.log("Upload complete for userId:", metadata.userId);
            console.log("file url", file.url);

            // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
            return { uploadedBy: metadata.userId };
        }),
        
    // Document Uploader for Knowledge Base Files
    documentUploader: f({ 
        pdf: { maxFileSize: "16MB", maxFileCount: 1 }, 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { maxFileSize: "16MB", maxFileCount: 1 }, // .docx
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { maxFileSize: "16MB", maxFileCount: 1 } // .xlsx
    })
        .middleware(async () => {
            // Add auth if necessary, currently Admin Panel routes are guarded by Next.js edge middleware
            return { uploadedBy: "admin" };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            console.log("Document upload complete. URL:", file.url);
            return { url: file.url };
        }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
