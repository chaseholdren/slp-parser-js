const readFileAsArrayBuffer: (inputFile: Blob) => Promise<ArrayBuffer> = (inputFile) => {
    const temporaryFileReader = new FileReader();

    return new Promise((resolve, reject) => {
        temporaryFileReader.onerror = () => {
            temporaryFileReader.abort();
            reject(new DOMException('Problem parsing input file.'));
        };

        temporaryFileReader.onload = () => {
            if (temporaryFileReader.result === null || typeof temporaryFileReader.result === 'string') {
                reject(new DOMException('Problem parsing input file.'));
            }
            resolve(temporaryFileReader.result as ArrayBuffer);
        };
        temporaryFileReader.readAsArrayBuffer(inputFile);
    });
};

export default readFileAsArrayBuffer;
