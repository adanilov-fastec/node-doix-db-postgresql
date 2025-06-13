const Path = require ('path')
const {DbModel} = require ('doix-db')
const MockJob = require ('./lib/MockJob.js'), job = new MockJob ()
const {DbPoolPg} = require ('..')

const pool = new DbPoolPg ({
	db: {
		connectionString: process.env.CONNECTION_STRING,
	},
})

pool.logger = job.logger

const src = Path.join (__dirname, 'data', 'root1')

afterAll(async () => {

	await pool.pool.end ()

})

test ('basic', async () => {

	const m = new DbModel ({src, db: pool})
	m.loadModules ()

	try {

		var db = await pool.setResource (job, 'db')

		await db.do ('DROP TABLE IF EXISTS tb_22')
		await db.createTempTable ('tb_22')
		await db.do ('ALTER TABLE tb_22 ADD PRIMARY KEY (id)')

		expect (db.txn).toBeNull ()

		await db.commit ()
		await db.rollback ()
		
		await db.begin ()
		expect (db.txn).toStrictEqual ({})

		await db.insert ('tb_22', {id: 1, label: 'user'})
		expect (db.txn).toStrictEqual ({})

		await db.commit ()		
		expect (db.txn).toBeNull ()
		expect (await db.getArray ('SELECT * FROM tb_22')).toStrictEqual ([{id: 1, label: 'user'}])

		await db.begin ()
		expect (db.txn).toStrictEqual ({})

		await db.update ('tb_22', {id: 1, label: 'admin'})
		expect (db.txn).toStrictEqual ({})
		expect (await db.getArray ('SELECT * FROM tb_22')).toStrictEqual ([{id: 1, label: 'admin'}])

		await db.rollback ()		
		expect (db.txn).toBeNull ()
		expect (await db.getArray ('SELECT * FROM tb_22')).toStrictEqual ([{id: 1, label: 'user'}])

		await db.begin ()

	}	
	finally {

		expect (db.txn).toStrictEqual ({})
		await db.release ()
		expect (db.txn).toBeNull ()

	}

})

test ('error', async () => {

	const m = new DbModel ({src, db: pool})
	m.loadModules ()

	const ERR = Error ('OK')

	try {

		var db = await pool.setResource (job, 'db')

		await db.do ('DROP TABLE IF EXISTS tb_22')
		await db.createTempTable ('tb_22')
		await db.do ('ALTER TABLE tb_22 ADD PRIMARY KEY (id)')

		await db.begin ()
		await db.insert ('tb_22', {id: 1, label: 'user'})
		await db.commit ()

		expect (await db.getArray ('SELECT * FROM tb_22')).toStrictEqual ([{id: 1, label: 'user'}])

		await db.begin ()
		await db.update ('tb_22', {id: 1, label: 'admin'})
		throw (job.error = ERR)

	}	
	catch (e) {

		if (e === ERR) return

	}
	finally {

		await db.release ()

		{
			try {
				delete job.error
				var db = await pool.setResource (job, 'db')
				expect (await db.getArray ('SELECT * FROM tb_22')).toStrictEqual ([{id: 1, label: 'user'}])
			}	
			finally {
				await db.release ()
			}

		}

	}

})

test ('auto', async () => {

	const pool = new DbPoolPg ({
		db: {
			connectionString: process.env.CONNECTION_STRING,
		},
	})

	pool.isToBegin = db => 'action' in db.job.rq

	{

		try {

			var isReleased = false

			const job = new MockJob ()

			pool.logger = job.logger

			job.rq = {type: 'users', id: 1}

			var db = await pool.setResource (job, 'db')

			db.on ('released', () => isReleased = true)

			expect (db.isAutoCommit ()).toBe (true)

		}	
		finally {

			expect (isReleased).toBe (false)

			await db.release ()

			expect (isReleased).toBe (true)

		}

	}

	{

		try {

			var isReleased = false

			const job = new MockJob ()

			pool.logger = job.logger

			job.rq = {type: 'users', action: 'create'}

			var db = await pool.setResource (job, 'db')

			db.on ('released', () => isReleased = true)

			expect (db.isAutoCommit ()).toBe (false)

		}	
		finally {

			expect (isReleased).toBe (false)

			await db.release ()

			expect (isReleased).toBe (true)

		}

	}

	await pool.pool.end ()

})
