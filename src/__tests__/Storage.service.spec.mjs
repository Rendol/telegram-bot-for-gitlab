import {StorageService} from '../services/Storage.service.mjs';
import {makePersistent} from '../tools/makePersistent.mjs';

const sleep = timeout => new Promise(resolve => setTimeout(resolve, timeout));

describe('Storage', function () {
  it('check interface', async () => {
    const ttl = 1;
    /**
     * @type {StorageService}
     */
    const storage = await makePersistent('/dev/null', new StorageService(), {
      ttl,
    });

    storage.addProject(3001, 'http://gitlab.com/test/test3000');
    storage.addProject(3002, 'http://gitlab.com/test/test3000');
    await sleep(ttl + 100);
    expect(storage.getChats('http://gitlab.com/test/test3000')).toHaveLength(2);

    storage.addProject(1000, 'http://gitlab.com/test/test1001');
    storage.addProject(1000, 'http://gitlab.com/test/test1002');
    await sleep(ttl + 100);
    expect(storage.getProjects(1000)).toHaveLength(2);

    storage.addProject(2000, 'http://gitlab.com/test/test2000');
    storage.addProject(2000, 'http://gitlab.com/test/test2000');
    await sleep(ttl + 100);
    expect(storage.getProjects(2000)).toHaveLength(1);

    storage.addProject(3001, 'http://gitlab.com/test/test3000');
    storage.addProject(3002, 'http://gitlab.com/test/test3000');
    await sleep(ttl + 100);
    expect(storage.getChats('http://gitlab.com/test/test3000')).toHaveLength(2);

    storage.addProject(4001, 'http://gitlab.com/test/test4000');
    storage.addProject(4002, 'http://gitlab.com/test/test4000');
    storage.delProject(4001, 'http://gitlab.com/test/test4000');
    await sleep(ttl + 100);
    expect(storage.getChats('http://gitlab.com/test/test4000')).toHaveLength(1);
  });
  it('check restore', async () => {
    const ttl = 1;
    // const storageFilePath = path.resolve(os.tmpdir(), 'storage.json');
    const storageFilePath = 'storage.json';
    console.info('Temp storage file:', storageFilePath);
    /**
     * @type {StorageService}
     */
    const storageA = await makePersistent(
      storageFilePath,
      new StorageService(),
      {ttl},
    );

    storageA.addProject(1000, 'http://gitlab.com/test/test1001');
    storageA.addProject(1000, 'http://gitlab.com/test/test1002');
    await sleep(ttl + 100);

    const storageB = await makePersistent(
      storageFilePath,
      new StorageService(),
      {ttl},
    );
    expect(storageB.getChats('http://gitlab.com/test/test1001')).toHaveLength(
      1,
    );
    expect(storageB.getProjects(1000)).toHaveLength(2);
  });
});
