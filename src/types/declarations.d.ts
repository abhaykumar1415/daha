declare module 'junit-report-builder' {
  interface TestCase {
    name(name: string): TestCase;
    className(className: string): TestCase;
    failure(message: string): TestCase;
  }
  interface TestSuite {
    name(name: string): TestSuite;
    testCase(): TestCase;
  }
  interface Builder {
    testSuite(): TestSuite;
    writeTo(filePath: string): void;
  }
  const builder: Builder;
  export default builder;
}
