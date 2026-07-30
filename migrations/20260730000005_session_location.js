exports.up = async function up(knex) {
    await knex.raw(`
        ALTER TABLE session_devices
        ADD COLUMN location_label VARCHAR(128) NULL;
    `);
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE session_devices DROP COLUMN location_label');
};
