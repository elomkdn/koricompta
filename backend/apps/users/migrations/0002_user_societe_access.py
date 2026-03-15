from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
        ('comptabilite', '0004_add_audit_log'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='user',
            name='societe',
        ),
        migrations.CreateModel(
            name='UserSocieteAccess',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='societe_accesses', to=settings.AUTH_USER_MODEL)),
                ('societe', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_accesses', to='comptabilite.societe')),
            ],
            options={
                'verbose_name': 'Accès société',
                'verbose_name_plural': 'Accès sociétés',
                'unique_together': {('user', 'societe')},
            },
        ),
    ]
