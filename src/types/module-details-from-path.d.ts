// Type definitions for module-details-from-path
// Based on the library's API and usage patterns

declare module 'module-details-from-path' {
    interface ModuleDetails {
        /** The name of the module (from package.json) */
        name: string;

        /** The absolute path to the module's root directory */
        basedir: string;

        /** The relative path within the module */
        path: string;
    }

    /**
     * Extract module details from a file path
     * @param filepath - The absolute file path to analyze
     * @returns Module details if the file is within a module, null otherwise
     */
    export default function (filepath: string): ModuleDetails | null;
}
